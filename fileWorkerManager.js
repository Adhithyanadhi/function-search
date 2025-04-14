
require('./logger'); // Must be at the top

const { Worker } = require('worker_threads');
const { supportedExtensions } = require('./constants');
const { isExcluded } = require("./utils")

class WorkerManager {
	constructor(workerScriptPath, functionIndex) {
		this.worker = new Worker(workerScriptPath);
        this.functionIndex = functionIndex;

        this.worker.on('message', (data) => {
            if (data.type === 'fetchedFunctions') {
                if (data.filePath == undefined || data.functions == undefined) {
                    console.log("data is empty", data);
                } else {
                    this.functionIndex[data.filePath] = data.functions;
                }
            }
        });
    
        this.worker.on('error', (err) => console.error("Worker Error:", err));
    
        this.worker.on('exit', (code) => {
            if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
        });
	}

	postMessage(data) {
        if (data.initialLoad !== true && (!supportedExtensions.includes(data.extension) || isExcluded(data.filePath))) {
            return
		}

		this.worker.postMessage(data);
        console.log(new Date().toISOString(), "posted", data)
	}
}

module.exports = { WorkerManager};

