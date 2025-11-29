const logger = require('../utils/logger');
const { Worker } = require('worker_threads');
const { isExcluded } = require("../utils/common")
const { supportedExtensions, DISK_WORKER_FILE_PATH, DELETE_ALL_CACHE, WRITE_CACHE_TO_FILE, INODE_MODIFIED_AT, FLUSH_LAST_ACCESS } = require('../config/constants');
const diskWorker = new Worker(DISK_WORKER_FILE_PATH);

class WorkerManager {
    constructor(workerScriptPath, functionIndex) {
        this.worker = new Worker(workerScriptPath);
        this.functionIndex = functionIndex;
        this.postMessage = this.postMessage.bind(this);

        this.worker.on('message', (message) => {
            if (message.type === WRITE_CACHE_TO_FILE) {
                diskWorker.postMessage({
                    type: WRITE_CACHE_TO_FILE,
                    payload: {
                        filePath: message.payload?.filePath,
                        inodeModifiedAt: message.payload?.inodeModifiedAt,
                        functionIndex: message.payload?.functionIndex,
                    }
                });
            } else if (message.type === FLUSH_LAST_ACCESS) {
                diskWorker.postMessage({ type: FLUSH_LAST_ACCESS });
            } else {
                logger.error('WorkerManager received invalid message of type', message.type );
            }
        });

        this.worker.on('error', (err) => logger.error("Worker Error:", err));

        this.worker.on('exit', (code) => {
            if (code !== 0) {logger.error(`Worker stopped with exit code ${code}`);}
        });
    }

    postMessage(message) {
        const p = message?.payload || {};
        if(message.type === INODE_MODIFIED_AT){
            this.worker.postMessage(message);
            return;
        } else if (message.type === WRITE_CACHE_TO_FILE) {
            diskWorker.postMessage({ type: WRITE_CACHE_TO_FILE, payload: message.payload });
            return;
        } else if (message.type === FLUSH_LAST_ACCESS) {
            diskWorker.postMessage({ type: FLUSH_LAST_ACCESS });
            return;
        } else if (message.type === DELETE_ALL_CACHE) {
            diskWorker.postMessage(message);
            return;
        } else if (p?.initialLoad !== true && (!supportedExtensions.includes(p?.extension) || isExcluded(p?.filePath))) {
            logger.debug('WorkerManager received invalid-message:', message);
            return
        }
        this.worker.postMessage(message);
    }
}

module.exports = { WorkerManager };


