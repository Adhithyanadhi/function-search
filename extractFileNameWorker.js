const { getExtentionFromFilePath } = require('./helper')


const { functionRegexMap, supportedExtensions } = require('./constants');
const { Worker, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');


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
        await extractFileNames(task);
    }
    idle = true;
}

async function extractFileNames(task) {
    const files = preprocessFiles(task.workspacePath, task.extension);

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

function preprocessFiles(workspacePath, extension) {
    function isExcluded(dir) {
        return dir.includes('lib') || dir.includes('.git') || dir.startsWith('.');
    }
    let functions = []

    if (extension != "__all__" && !supportedExtensions.some(ext => extension == ext)) {
        return functions
    }


    function readDirRecursive(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (isExcluded(entry.name)) return;
                readDirRecursive(fullPath);
            } else {
                if (extension == "__all__" || entry.name.endsWith(extension)) {
                    functions.push(fullPath)
                }
            }
        });
    }

    readDirRecursive(workspacePath);
    return functions;
}


function watchForChanges(workspacePath) {

    fs.watch(workspacePath, { recursive: true }, (eventType, filename) => {
        if (filename && supportedExtensions.some(ext => filename.endsWith(ext))) {
            const filePath = path.join(workspacePath, filename);
            if (fs.existsSync(filePath)) {
                internalEmitter.emit("extractFileNames", { type: 'extractFileNames', workspacePath, filePath, priority: "high", extension: getExtentionFromFilePath(filePath) });
            } else {
                parentPort.postMessage({ type: 'delete', filePath });
            }
        }
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
    } else if (message.type === "update") {
        parentPort.postMessage(message);
    } else {
        console.log("invalid message type ")
    }
    watchForChanges(message.workspacePath);
}


functionWorker.on('message', (message) => {

    if (message.type === "update") {
        parentPort.postMessage(message);
    } else {
        console.log("invalid message type ")
    }
});

parentPort.on('message', (message) => { serve(message) });
internalEmitter.on('extractFileNames', (message) => { serve(message) });
