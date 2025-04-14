require('./logger'); // Must be at the top

const { getExtentionFromFilePath, isExcluded } = require('./utils')
const { supportedExtensions, PROCESS_FILE_TIME_OUT } = require('./constants');
const { Worker, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const inodeModifiedAt = new Map();
const functionWorker = new Worker(path.join(__dirname, "./extractFunctionNameWorker.js"))

let highPriorityFileQueue = [];
let lowPriorityFileQueue = [];
let idle = true;
let debounceMap = new Map();


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
        const fileExtension = getExtentionFromFilePath(filePath)

        if (!supportedExtensions.includes(fileExtension)) {
            continue;
        }

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

            if (stat.mtimeMs <= lastSeen || isExcluded(fullPath)) {
                return
            }

            inodeModifiedAt.set(fullPath, stat.mtimeMs);

            if (!stat.isDirectory()) {
                handleFiles(fullPath)
            } else {
                fs.readdirSync(fullPath).forEach(entry => {
                    readDirRecursive(path.join(fullPath, entry));
                });
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
    } else {
        console.log("invalid message type ", message)
    }
}


functionWorker.on('message', (message) => {
    if (message.type === "fetchedFunctions") {
        parentPort.postMessage(message);
    } else {
        console.log("invalid message type ", message)
    }
});

parentPort.on('message', (message) => { serve(message) });

// TODO looks like idle value or initialized multiple times, whenever this file is called
// // check valid file name before pushing to for function name extract same as file worker
