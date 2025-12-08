const logger = require('../../utils/logger');
const { parentPort } = require('worker_threads');
const { createParentBus } = require('../../services/messaging/workerBus');
const { EXTRACT_FUNCTION_NAMES, UPDATE_REGEX_CONFIG, FETCHED_FUNCTIONS, UPDATE_IGNORE_CONFIG } = require('../../config/constants');
const { FILE_PROPERTIES } = require('../../config/constants');
const fs = require('fs');
const path = require('path');
const highPriorityFileQueue = new Map();
const lowPriorityFileQueue = new Map();

let idle = true;
let regex_store = null;

function extractFunctions(filePath, relativeFilePath) {
    const functionList = [];
    if(!regex_store){
        logger.error("extractFunctions - regex not initialized");
        return functionList;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');

    const extension = path.extname(filePath);
    if (extension.length === 0 || !(extension in FILE_PROPERTIES)) {
        return functionList;
    }

    const regexes = regex_store[extension];

    if (!regexes || !regexes.length) {
        return functionList;
    }


    for (const regex of regexes) {
        if (!regex) {continue;}

        fileContent.split('\n').forEach((line, index) => {
            const match = line.match(regex);
            if (match) {
                if (match[1] !== undefined) {
                    functionList.push({
                        name: match[1],
                        file: filePath,
                        line: index+1,
                        relativeFilePath,
                    });
                }
            }
        });
    }

    return functionList;
}

function fetchTask() {
    let task;
    if (highPriorityFileQueue.size > 0) {
        const firstKey = highPriorityFileQueue.keys().next().value;
        task = highPriorityFileQueue.get(firstKey);
        highPriorityFileQueue.delete(firstKey)
    } else {
        const firstKey = lowPriorityFileQueue.keys().next().value;
        task = lowPriorityFileQueue.get(firstKey);
        lowPriorityFileQueue.delete(firstKey)
    }
    return task;
}

const parentBus = createParentBus(parentPort);

async function processFiles() {
    if (!idle) {return;}
    idle = false;

    while (highPriorityFileQueue.size + lowPriorityFileQueue.size > 0) {
        const { workspacePath, filePath } = fetchTask();
        if (!fs.existsSync(filePath)) {continue;}
        const relativeFilePath = path.relative(workspacePath, filePath);
        const functions = await extractFunctions(filePath, relativeFilePath);
        if(functions.length == 0){ continue;}
        parentBus.postMessage(FETCHED_FUNCTIONS, { filePath, functions }, 'low');
    }

    idle = true;
}

parentPort.on('message', (message) => {
    if (message.type === EXTRACT_FUNCTION_NAMES) {
        try {
            const p = message.payload || message;
            const pr = p.priority || 'low';
            if (pr === "high" && !highPriorityFileQueue.has(p.filePath)) {
                highPriorityFileQueue.set(p.filePath, p);
            } else if (!lowPriorityFileQueue.has(p.filePath)) {
                lowPriorityFileQueue.set(p.filePath, p);
            }
            processFiles()
        } catch (error) {
            logger.error("Worker Error:", error);
            parentBus.postMessage('error', { message: error.message }, 'high');
        }
    } else if(message.type === UPDATE_REGEX_CONFIG){
        regex_store = message.payload;
    } else{
		logger.error('[Worker:extractFunctoinName] received invalid message',JSON.stringify(message, null, 2));
    }
});


