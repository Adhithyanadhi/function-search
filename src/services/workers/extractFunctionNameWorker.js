const logger = require('../../utils/logger');
const { parentPort } = require('worker_threads');
const { createParentBus } = require('../../services/messaging/workerBus');
const { EXTRACT_FUNCTION_NAMES, FETCHED_FUNCTIONS } = require('../../config/constants');
const { FILE_PROPERTIES } = require('../../config/constants');
const fs = require('fs');
const path = require('path');
const highPriorityFileQueue = new Map();
const lowPriorityFileQueue = new Map();
let idle = true;

function extractFunctions(filePath, relativeFilePath) {
    const functionList = [];
    const fileContent = fs.readFileSync(filePath, 'utf8');

    const extension = path.extname(filePath);
    if (extension.length === 0 || !(extension in FILE_PROPERTIES)) {
        return functionList;
    }

    const regex = FILE_PROPERTIES[extension].regex;

    if (!regex) {return functionList;}

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
    }
});


