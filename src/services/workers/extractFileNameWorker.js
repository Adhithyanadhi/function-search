const logger = require('../../utils/logger');
const { getExtensionFromFilePath } = require('../../utils/common')
const { FUNCTION_EXTRACT_FILE_PATH, supportedExtensions, PROCESS_FILE_TIME_OUT, MAX_INGRES_X_FUNCTION, X_FUNCTION_INGRES_TIMEOUT, get_invalid_dir_fragments,  set_invalid_dir_fragments } = require('../../config/constants');
const { Worker, parentPort } = require('worker_threads');
const { createParentBus, createChildBus } = require('../../services/messaging/workerBus');
const { EXTRACT_FUNCTION_NAMES, EXTRACT_FILE_NAMES, INODE_MODIFIED_AT, FETCHED_FUNCTIONS, UPDATE_REGEX_CONFIG, UPDATE_IGNORE_CONFIG } = require('../../config/constants');
const {isExcluded} = require('../../utils/common')

const fs = require('fs');
const path = require('path');

let functionWorker = null;
createFunctionWorker();


const parentBus = createParentBus(parentPort);
const childBus = createChildBus(functionWorker);

let inodeModifiedAt = new Map();
let inodeModifiedAtUpdates = new Map();
const highPriorityFileQueue = [];
const lowPriorityFileQueue = [];
let idle = true;
const debounceMap = new Map();
let updateInodeModifiedAtTimer = null;
let ingress = 0;

async function processFiles() {
	if (!idle) {return;}
	idle = false;
	while (highPriorityFileQueue.length + lowPriorityFileQueue.length > 0) {
		const task = highPriorityFileQueue.length > 0
			? highPriorityFileQueue.shift()
			: lowPriorityFileQueue.shift();

		const filePath = task.filePath;
		if (!filePath) {continue;}

		if (debounceMap.has(filePath)) {
			clearTimeout(debounceMap.get(filePath));
		}

		const timer = setTimeout(async () => {
			debounceMap.delete(filePath);
			await extractFileNames(task);
		}, PROCESS_FILE_TIME_OUT);

		debounceMap.set(filePath, timer);
	}

	idle = true;
}

function updateInodeModifiedAt(fullPath, at){
	inodeModifiedAt.set(fullPath, at);
	inodeModifiedAtUpdates.set(fullPath, at);
	if(updateInodeModifiedAtTimer){
		clearTimeout(updateInodeModifiedAtTimer);
	}
	updateInodeModifiedAtTimer = setTimeout(() => {
		const payload = new Map(inodeModifiedAtUpdates);
		parentBus.postMessage(INODE_MODIFIED_AT, payload);
		inodeModifiedAtUpdates.clear();
		updateInodeModifiedAtTimer = null;
	}, 5000);
}

async function extractFileNames(task) {
	logger.debug("new task extractfilenames", task.filePath, task.extension);
	const files = preprocessFiles(task.filePath, task.extension);

	for (const filePath of files) {
		const fileExtension = getExtensionFromFilePath(filePath);
		if (!supportedExtensions.includes(fileExtension)) {continue;}

		while (ingress >= MAX_INGRES_X_FUNCTION) {
			logger.debug("Max ingress reached", ingress);
			await functionWorkerHeathCheck();
		}

		ingress++;
		childBus.postMessage(EXTRACT_FUNCTION_NAMES, {
			filePath,
			priority: task.priority || 'low',
			workspacePath: task.workspacePath
		}, task.priority || 'low');
	}
}

function preprocessFiles(absoluteFilePath, extension) {
	const filesToProcess = [];

	if (extension !== '__all__' && !supportedExtensions.includes(extension)) {
		return filesToProcess;
	}


	function readDirRecursive(fullPath) {
		try {
			if (isExcluded(fullPath)) {
				return;
			}

			const stat = fs.statSync(fullPath);
			const lastSeen = inodeModifiedAt.get(fullPath) || 0;


			if (stat.mtimeMs <= lastSeen) {
				return;
			}

			if (stat.isDirectory()) {
				updateInodeModifiedAt(fullPath, stat.mtimeMs);
				fs.readdirSync(fullPath).forEach(entry => {
					readDirRecursive(path.join(fullPath, entry));
				});
			} else if (fullPath.endsWith(extension) || (extension === '__all__' && supportedExtensions.some(ext => fullPath.endsWith(ext)))) {
					updateInodeModifiedAt(fullPath, stat.mtimeMs);
					filesToProcess.push(fullPath);
			}
        } catch (err) {
            logger.error(`Failed to stat: ${fullPath}`, err);
		}
	}
	readDirRecursive(absoluteFilePath);
	return filesToProcess;
}


function createFunctionWorker(){
	functionWorker = new Worker(FUNCTION_EXTRACT_FILE_PATH)
}

async function restartFunctionWorker() {
	logger.warn('[Indexer] Restarting functionWorker');

	try {
		await functionWorker.terminate();
	} catch (err) {
		logger.error('[Indexer] Error terminating old functionWorker', err);
	}

	createFunctionWorker();
}


async function functionWorkerHeathCheck() {
	const timeoutMs = 10000;
	const worker = functionWorker; // snapshot

	return new Promise((resolve, reject) => {
		// Case 1: worker is null -> wait 2s, then try again
		if (!worker) {
			setTimeout(() => {
				// after 2s, check again
				if (!functionWorker) {
					return reject(new Error('FunctionWorker is null even after wait'));
				}
				// re-run healthcheck on the new worker
				functionWorkerHeathCheck().then(resolve).catch(reject);
			}, timeoutMs);
			return;
		}

		const request_id = Date.now(); // current timestamp as request_id

		const onMessage = (msg) => {
			if (!msg || msg.type !== 'PONG') return;
			if (msg.response_id !== request_id) return; // not our PONG

			clearTimeout(timer);
			worker.off('message', onMessage);
			resolve(msg);
		};

		const timer = setTimeout(async () => {
			worker.off('message', onMessage);

			const restartPromise = restartFunctionWorker();
			restartPromise.catch((err) => {
				logger.error('[Indexer] Failed to restart FunctionWorker', err);
			});
			await restartPromise;      
			resolve(`New FunctionWorker created after timeout (request_id=${request_id})`);
		}, timeoutMs);

		worker.on('message', onMessage);

		try {
			worker.postMessage({ type: 'PING', request_id });
		} catch (err) {
			clearTimeout(timer);
			worker.off('message', onMessage);
			reject(err);
		}
	});
}




function serve(message) {
	if (message.type === EXTRACT_FILE_NAMES) {
		const payload = message.payload || message;
		logger.debug('[Worker:extractFileName] received extractFileNames:', JSON.stringify({ source: payload.source, filePath: payload.filePath, ext: payload.extension }));
		try {
			if (message.priority === "high") {
				highPriorityFileQueue.push(payload);
			} else {
				lowPriorityFileQueue.push(payload);
			}
			processFiles()
		} catch (error) {
			logger.error("Worker Error:", error);
			parentBus.postMessage('error', { message: error.message }, 'high');
		}
	} else if (message.type === INODE_MODIFIED_AT) {
		logger.debug('[Worker:extractFileName] set inodeModifiedAt map');
		inodeModifiedAt = (message.payload && message.payload.map) || message.data;
	} else if (message.type === UPDATE_REGEX_CONFIG) {
		logger.debug('[Worker:extractFileName] update regex config');
		inodeModifiedAt = new Map();
		childBus.postMessage(message.type, message.payload, message.priority);
	} else if (message.type === UPDATE_IGNORE_CONFIG) {
		logger.debug('[Worker:extractFileName] update ignore config');
		inodeModifiedAt = new Map();
		set_invalid_dir_fragments(message.payload);
	} else {
		logger.debug('[Worker:extractFileName] unhandled msg', message);
	}
}

childBus.on(FETCHED_FUNCTIONS, (message) => {
	ingress--;
	const p = message.payload || {};
	logger.debug('[Worker:extractFileName] emitting fetchedFunctions for', p.filePath, 'count=', (p.functions||[]).length);
	if(p.functions !== null || p.functions.length > 0){
		parentBus.postMessage(FETCHED_FUNCTIONS, p, 'low');
	}
});

parentPort.on('message', (message) => { serve(message) });


