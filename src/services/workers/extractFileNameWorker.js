const logger = require('../../utils/logger');
const { getExtensionFromFilePath, isExcluded } = require('../../utils/common')
const { FUNCTION_EXTRACT_FILE_PATH, supportedExtensions, PROCESS_FILE_TIME_OUT, MAX_INGRES_X_FUNCTION, X_FUNCTION_INGRES_TIMEOUT } = require('../../config/constants');
const { Worker, parentPort } = require('worker_threads');
const { createParentBus, createChildBus } = require('../../services/messaging/workerBus');
const { EXTRACT_FUNCTION_NAMES, EXTRACT_FILE_NAMES, WRITE_CACHE_TO_FILE, INODE_MODIFIED_AT, FETCHED_FUNCTIONS } = require('../../config/constants');

const fs = require('fs');
const path = require('path');
const functionWorker = new Worker(FUNCTION_EXTRACT_FILE_PATH)
const parentBus = createParentBus(parentPort);
const childBus = createChildBus(functionWorker);

let inodeModifiedAt = new Map();
const highPriorityFileQueue = [];
const lowPriorityFileQueue = [];
let idle = true;
const debounceMap = new Map();
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

async function extractFileNames(task) {
	logger.debug("new task extractfilenames", task.filePath, task.extension);
	const files = preprocessFiles(task.filePath, task.extension);

	for (const filePath of files) {
		const fileExtension = getExtensionFromFilePath(filePath);
		if (!supportedExtensions.includes(fileExtension)) {continue;}

		while (ingress >= MAX_INGRES_X_FUNCTION) {
			logger.debug("Max ingress reached", ingress);
			await new Promise(resolve => setTimeout(resolve, X_FUNCTION_INGRES_TIMEOUT));
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

	function handleFiles(fullPath) {
		if ((extension === '__all__' && supportedExtensions.some(ext => fullPath.endsWith(ext))) || fullPath.endsWith(extension)) {
			filesToProcess.push(fullPath);
		}
	}

	function readDirRecursive(fullPath) {
		try {
			if (isExcluded(fullPath)) {
				return;
			}

			const stat = fs.statSync(fullPath);
			const lastSeen = inodeModifiedAt.get(fullPath) || 0;


			if (stat.isDirectory()) {
				inodeModifiedAt.set(fullPath, stat.mtimeMs);
				fs.readdirSync(fullPath).forEach(entry => {
					readDirRecursive(path.join(fullPath, entry));
				});
			} else {
				if (stat.mtimeMs <= lastSeen) {
					return;
				}
				inodeModifiedAt.set(fullPath, stat.mtimeMs);
				handleFiles(fullPath);
			}
        } catch (err) {
            logger.error(`Failed to stat: ${fullPath}`, err);
		}
	}
	readDirRecursive(absoluteFilePath);
	return filesToProcess;
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
	} else if (message.type === WRITE_CACHE_TO_FILE) {
		parentBus.postMessage(WRITE_CACHE_TO_FILE, {
			filePath: (message.payload && message.payload.filePath) || message.filePath,
			inodeModifiedAt,
		}, 'low')
	} else {
	}
}

childBus.on(FETCHED_FUNCTIONS, (message) => {
		ingress--;
		const p = message.payload || {};
		logger.debug('[Worker:extractFileName] emitting fetchedFunctions for', p.filePath, 'count=', (p.functions||[]).length);
	parentBus.postMessage(FETCHED_FUNCTIONS, p, 'low');
});

parentPort.on('message', (message) => { serve(message) });


