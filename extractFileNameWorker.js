
require('./logger'); // Must be at the top

const { getExtensionFromFilePath, isExcluded } = require('./utils/common')
const { FUNCTION_EXTRACT_FILE_PATH, DISK_WORKER_FILE_PATH, supportedExtensions, PROCESS_FILE_TIME_OUT, MAX_INGRES_X_FUNCTION, X_FUNCTION_INGRES_TIMEOUT } = require('./constants');
const { Worker, parentPort } = require('worker_threads');

const fs = require('fs');
const path = require('path');
const functionWorker = new Worker(FUNCTION_EXTRACT_FILE_PATH)
const diskWorker = new Worker(DISK_WORKER_FILE_PATH)

let inodeModifiedAt = new Map();
let highPriorityFileQueue = [];
let lowPriorityFileQueue = [];
let idle = true;
let debounceMap = new Map();
let ingres = 0;

async function processFiles() {
    if (!idle) return;
    idle = false;
    while (highPriorityFileQueue.length + lowPriorityFileQueue.length > 0) {
        const task = highPriorityFileQueue.length > 0
            ? highPriorityFileQueue.shift()
            : lowPriorityFileQueue.shift();

        const filePath = task.filePath;
        if (!filePath) continue;

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
    const files = preprocessFiles(task.filePath, task.extension);

    for (const filePath of files) {
        const fileExtension = getExtensionFromFilePath(filePath);
        if (!supportedExtensions.includes(fileExtension)) continue;

        // Simple backpressure control, so that extract function name can run with the available file list
        while (ingres >= MAX_INGRES_X_FUNCTION) {
            await new Promise(resolve => setTimeout(resolve, X_FUNCTION_INGRES_TIMEOUT)); // very lightweight
        }

        ingres++;
        functionWorker.postMessage({
            type: "extractFunctionNames",
            filePath,
            priority: task.priority,
            workspacePath: task.workspacePath
        });
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
            const stat = fs.statSync(fullPath);
            const lastSeen = inodeModifiedAt.get(fullPath) || 0;

            if (isExcluded(fullPath)) {
                return;
            }

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
            console.error(`Failed to stat: ${fullPath}`, err);
        }
    }
    readDirRecursive(absoluteFilePath);
    return filesToProcess;
}


function serve(message) {
    if (message.type === 'extractFileNames') {
        try {
            if (message.priority == "high") {
                highPriorityFileQueue.push(message);
            } else {
                lowPriorityFileQueue.push(message);
            }
            processFiles()
        } catch (error) {
            console.error("Worker Error:", error);
            parentPort.postMessage({ type: "error", message: error.message });
        }
    } else if (message.type === "inodemodifiedat") {
        inodeModifiedAt = message.data;
    } else if (message.type === "write-inodeModifiedAt-to-file") {
        diskWorker.postMessage({
            type: message.type,
            filePath: message.filePath,
            data: inodeModifiedAt,
        })
    } else {
        console.log("invalid message type ", message)
    }
}


functionWorker.on('message', (message) => {
    if (message.type === "fetchedFunctions") {
        ingres--;
        parentPort.postMessage(message);
    } else {
        console.log("invalid message type ", message)
    }
});

diskWorker.on('message', (message) => {
    parentPort.postMessage({ type: "write-inodeModifiedAt-to-file-completed" });
});

parentPort.on('message', (message) => { serve(message) });

// TODO looks like idle value or initialized multiple times, whenever this file is called
// // check valid file name before pushing to for function name extract same as file worker
