require('../../utils/logger');
const { UPDATE_REGEX_CONFIG, EXTRACT_FILE_NAMES, INODE_MODIFIED_AT, UPDATE_IGNORE_CONFIG } = require('../../config/constants');

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
 
    updateRegexConfig(payload, priority = 'high', resetInodeExtensions = [], scanPayload = null) {
        this.sender.postMessage({
            type: UPDATE_REGEX_CONFIG,
            priority,
            payload: { regexConfig: payload, resetInodeExtensions, scanPayload }
        });
    }

    updateIgnoreConfig(payload, priority = 'high', resetinodemodifiedat = false, scanPayload = null) {
        this.sender.postMessage({
            type: UPDATE_IGNORE_CONFIG,
            priority,
            payload: { ignoreConfig: payload, resetinodemodifiedat, scanPayload }
        });
    }

    setInodeModifiedAt(data, priority = 'low') {
        this.sender.postMessage({ type: INODE_MODIFIED_AT, priority, payload: { data } });
    }
}

module.exports = { WorkerBus };
