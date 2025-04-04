require('./logger'); // Must be at the top

const { getExtentionFromFilePath } = require('./helper')


const { functionRegexMap, supportedExtensions, DEBOUNCE_DELAY } = require('./constants');
const { Worker, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const debounceMap = new Map();


let highPriorityFileQueue = [];
let lowPriorityFileQueue = [];
let idle = true;

functionWorker = new Worker(path.join(__dirname, "./extractFunctionNameWorker.js"))

const internalEmitter = new EventEmitter();

async function processFiles() {
    if (!idle) return;
    idle = false;
    while (highPriorityFileQueue.length + lowPriorityFileQueue.length > 0) {
        const task = highPriorityFileQueue.length > 0 ? highPriorityFileQueue.shift() : lowPriorityFileQueue.shift();
        console.log("task is ", JSON.stringify(task, null, 2))
        await extractFileNames(task);
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
    function isExcluded(dir) {
        return dir.includes('lib') || dir.includes('.git') || dir.startsWith('.');
    }

    let filesToProcess = [];

    if (extension !== "__all__" && !supportedExtensions.includes(extension)) {
        return filesToProcess;
    }

    function handleFiles(fullPath) {
        if (extension === "__all__" || fullPath.endsWith(extension)) {
            filesToProcess.push(fullPath);
        }
    }

    function readDirRecursive(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!isExcluded(entry.name)) {
                    readDirRecursive(fullPath);
                }
            } else {
                handleFiles(fullPath);
            }
        });
    }

    if (fs.existsSync(absoluteFilePath) && fs.statSync(absoluteFilePath).isDirectory()) {
        readDirRecursive(absoluteFilePath);
    } else if (fs.existsSync(absoluteFilePath)) {
        handleFiles(absoluteFilePath);
    }

    return filesToProcess;
}



function watchForChanges(workspacePath) {
    fs.watch(workspacePath, { recursive: true }, (eventType, filename) => {
        if (!filename || !supportedExtensions.some(ext => filename.endsWith(ext))) return;

        const filePath = path.join(workspacePath, filename);

        // Clear previous timer if any
        if (debounceMap.has(filePath)) {
            clearTimeout(debounceMap.get(filePath));
        }

        const timer = setTimeout(() => {
            debounceMap.delete(filePath);

            if (fs.existsSync(filePath)) {
                console.log("file changed", workspacePath, filePath);
                internalEmitter.emit("message", {
                    type: 'extractFileNames',
                    workspacePath,
                    filePath,
                    priority: "high",
                    extension: getExtentionFromFilePath(filePath),
                    source: "fileWatcher"
                });
            } else {
                parentPort.postMessage({ type: 'delete', filePath });
            }

        }, DEBOUNCE_DELAY);

        debounceMap.set(filePath, timer);
    });
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
    } else if (message.type === "fetchedFunctions") {
        parentPort.postMessage(message);
    } else {
        console.log("invalid message type ", message)
    }
    watchForChanges(message.workspacePath);
}


functionWorker.on('message', (message) => {
    if (message.type === "fetchedFunctions") {
        parentPort.postMessage(message);
    } else {
        console.log("invalid message type ", message)
    }
});

parentPort.on('message', (message) => { serve(message) });
internalEmitter.on('message', (message) => { serve(message) });
