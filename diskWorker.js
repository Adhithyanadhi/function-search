const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

parentPort.on('message', (message) => {
    if (message.type === "write-inodeModifiedAt-to-file") {
        fs.writeFile(message.filePath, JSON.stringify(Object.fromEntries(message.data), null, 2), (err) => {
            if (err) {
                console.error("Disk write failed:", err);
            } else {
                parentPort.postMessage({ type: "write-inodeModifiedAt-to-file-completed" });
            }
        });
    } else if (message.type === "write-functionIndex-to-file") {
        fs.writeFile(message.filePath, JSON.stringify(Object.fromEntries(message.data), null, 2), (err) => {
            if (err) {
                console.error("Disk write failed:", err);
            } 
        });
    } else {
        console.log("invalid message received on diskWorker", message)
    }
});

