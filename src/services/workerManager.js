const logger = require('../utils/logger');
const { Worker } = require('worker_threads');
const { isExcluded } = require("../utils/common")
const { supportedExtensions, DISK_WORKER_FILE_PATH, DELETE_ALL_CACHE, WRITE_CACHE_TO_FILE, INODE_MODIFIED_AT, EXTRACT_FILE_NAMES, UPDATE_REGEX_CONFIG, UPDATE_IGNORE_CONFIG } = require('../config/constants');
const diskWorker = new Worker(DISK_WORKER_FILE_PATH);

class WorkerManager {
    constructor(workerScriptPath, functionIndex) {
        this.worker = new Worker(workerScriptPath);
        this.functionIndex = functionIndex;
        this.postMessage = this.postMessage.bind(this);

        this.worker.on('message', (message) => {
            logger.error(
                'WorkerManager received invalid-message:',
                JSON.stringify(message, null, 2)
            );
        });

        this.worker.on('error', (err) => logger.error("Worker Error:", err));

        this.worker.on('exit', (code) => {
            if (code !== 0) { logger.error(`Worker stopped with exit code ${code}`); }
        });
    }

    postMessage(message) {
        const p = message?.payload || {};
        if (message.type === INODE_MODIFIED_AT) {
            this.worker.postMessage(message);
        } else if (message.type === WRITE_CACHE_TO_FILE) {
            diskWorker.postMessage({ type: WRITE_CACHE_TO_FILE, payload: message.payload });
        } else if (message.type === DELETE_ALL_CACHE) {
            diskWorker.postMessage(message);
        } else if (message.type == EXTRACT_FILE_NAMES && p?.initialLoad !== true && (!supportedExtensions.includes(p?.extension) || isExcluded(p?.filePath))) {
            logger.debug('WorkerManager skipping this run', message);
        } else if (message.type == EXTRACT_FILE_NAMES || message.type == UPDATE_REGEX_CONFIG || message.type == UPDATE_IGNORE_CONFIG) {
            this.worker.postMessage(message);
        } else {
            logger.error(
                'WorkerManager received invalid;;message:',
                JSON.stringify(message, null, 2)
            );
        }
    }
}

module.exports = { WorkerManager };


