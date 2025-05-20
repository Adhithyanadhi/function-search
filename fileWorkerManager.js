
require('./logger'); // Must be at the top

const { Worker } = require('worker_threads');
const { supportedExtensions, DISK_WORKER_FILE_PATH } = require('./constants');
const { isExcluded } = require("./utils/common")
const diskWorker = new Worker(DISK_WORKER_FILE_PATH);

class WorkerManager {
    constructor(workerScriptPath, functionIndex, functionIndexFilePath, updateCacheHandler) {
        this.worker = new Worker(workerScriptPath);
        this.functionIndex = functionIndex;

        this.worker.on('message', (message) => {
            if (message.type === 'fetchedFunctions') {
                if (message.filePath == undefined || message.functions == undefined) {
                    console.log("message is empty", message);
                } else {
                    this.functionIndex.set(message.filePath, message.functions);
                    updateCacheHandler(message.filePath);
                }
            } else if (message.type === "write-inodeModifiedAt-to-file-completed") {
                diskWorker.postMessage({
                    type: "write-functionIndex-to-file",
                    filePath: functionIndexFilePath,
                    data: functionIndex,
                });
            }
            else {
                console.log("unexpected message in fileWorkerManager", message);
            }
        });

        this.worker.on('error', (err) => console.error("Worker Error:", err));

        this.worker.on('exit', (code) => {
            if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
        });
    }

    postMessage(message) {
        if(message.type === "write-inodeModifiedAt-to-file" || message.type === "inodemodifiedat"){
            this.worker.postMessage(message);
        } else if (message.initialLoad !== true && (!supportedExtensions.includes(message.extension) || isExcluded(message.filePath))) {
            return
        }
        this.worker.postMessage(message);
    }
}

module.exports = { WorkerManager };

