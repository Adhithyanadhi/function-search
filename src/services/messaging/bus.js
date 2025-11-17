require('../../utils/logger');
const { EXTRACT_FILE_NAMES, WRITE_CACHE_TO_FILE, INODE_MODIFIED_AT, FLUSH_LAST_ACCESS } = require('../../config/constants');

class WorkerBus {
    constructor(messageSource, sender) {
        this.messageSource = messageSource;
        this.sender = sender;
        this.subscribers = new Map();
    }

    on(type, handler) {
        if (!this.subscribers.has(type)) {this.subscribers.set(type, new Set());}
        this.subscribers.get(type).add(handler);
        return () => this.subscribers.get(type).delete(handler);
    }

    bind() {
        this.messageSource.on('message', (message) => {
            const set = this.subscribers.get(message.type);
            if (set) {for (const fn of set) {fn(message);}}
        });
    }


    extractFileNames(payload, priority = 'low') {
        this.sender.postMessage({ type: EXTRACT_FILE_NAMES, priority, payload });
    }

    writeCacheToFile(payload, priority = 'low') {
        this.sender.postMessage({ type: WRITE_CACHE_TO_FILE, priority, payload });
    }

    setInodeModifiedAt(data, priority = 'low') {
        this.sender.postMessage({ type: INODE_MODIFIED_AT, priority, payload: { map: data } });
    }

    flushLastAccess(payload, priority = 'low') {
        this.sender.postMessage({ type: FLUSH_LAST_ACCESS, priority, payload });
    }
}

module.exports = { WorkerBus };


