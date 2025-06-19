require('./logger'); // Must be at the top
const { parentPort } = require('worker_threads');
const { FILE_PROPERTIES } = require('./constants');
const fs = require('fs');
const path = require('path');
let highPriorityFileQueue = new Map();
let lowPriorityFileQueue = new Map();
let idle = true;

function extractFunctions(filePath, relativeFilePath) {
    const functionList = [];
    const fileContent = fs.readFileSync(filePath, 'utf8');

    const extension = path.extname(filePath);
    if (extension.length == 0 || !(extension in FILE_PROPERTIES)) {
        return functionList;
    }

    const regex = FILE_PROPERTIES[extension].regex;

    if (!regex) return functionList;

    fileContent.split('\n').forEach((line, index) => {
        const match = line.match(regex);
        if (match) {
            if (match[1] == undefined) {
                console.log("invalid function name", match)
            } else {
                functionList.push({
                    name: match[1],
                    file: filePath,
                    line: index + 1,
                    relativeFilePath: relativeFilePath,
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


async function processFiles() {
    if (!idle) return;
    idle = false;

    while (highPriorityFileQueue.size + lowPriorityFileQueue.size > 0) {
        const { workspacePath, filePath } = fetchTask();
        if (!fs.existsSync(filePath)) continue;
        const relativeFilePath = path.relative(workspacePath, filePath);
        const functions = await extractFunctions(filePath, relativeFilePath);
        parentPort.postMessage({ type: 'fetchedFunctions', filePath, functions });
    }

    idle = true;
}

parentPort.on('message', (message) => {
    if (message.type == "extractFunctionNames") {
        try {
            if (message.priority == "high" && !highPriorityFileQueue.has(message.filePath)) {
                highPriorityFileQueue.set(message.filePath, message);
            } else if (message.priority == "low" && !lowPriorityFileQueue.has(message.filePath)) {
                lowPriorityFileQueue.set(message.filePath, message);
            }
            processFiles()
        } catch (error) {
            console.error("Worker Error:", error);
            parentPort.postMessage({ type: "error", message: error.message });
        }
    }
});


parentPort.on('error', (err) => console.error("parentPort Error:", err));

parentPort.on('exit', (code) => {
    if (code !== 0) console.error(`parentPort stopped with exit code ${code}`);
});