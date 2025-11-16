const logger = require('../../utils/logger');
const { parentPort } = require('worker_threads');
const { WRITE_CACHE_TO_FILE, FLUSH_LAST_ACCESS } = require('../../config/constants');

// Import the new service classes
const { DatabaseRepository } = require('../database/databaseRepository');
const { CacheWriterService } = require('../database/cacheWriterService');
const { DualBufferManager } = require('../dualBufferManager');

// Create service instances for worker thread
let dbRepo = null;
let cacheWriter = null;
let functionIndexBuffer = null;
let lastAccessBuffer = null;

// Initialize services
async function initializeServices() {
    try {
        // Create a minimal container-like object for worker thread
        const container = {
            get: (serviceName) => {
                switch (serviceName) {
                    case 'databaseRepository':
                        return dbRepo;
                    case 'cacheWriterService':
                        return cacheWriter;
                    case 'functionIndexBuffer':
                        return functionIndexBuffer;
                    case 'lastAccessBuffer':
                        return lastAccessBuffer;
                    default:
                        throw new Error(`Service ${serviceName} not found in worker`);
                }
            }
        };

        // Initialize services
        dbRepo = new DatabaseRepository(container);
        await dbRepo.initialize();
        
        cacheWriter = new CacheWriterService(container);
        await cacheWriter.initialize();
        
        functionIndexBuffer = new DualBufferManager(container, 'FunctionIndex');
        await functionIndexBuffer.initialize();
        
        lastAccessBuffer = new DualBufferManager(container, 'LastAccess');
        await lastAccessBuffer.initialize();
        
        inodeModifiedAtBuffer = new DualBufferManager(container, 'InodeModifiedAt');
        await inodeModifiedAtBuffer.initialize();
        
        logger.debug('[DiskWorker] Services initialized');
    } catch (e) {
        logger.error('[DiskWorker] Failed to initialize services:', e);
    }
}

// Initialize services on startup
initializeServices();

parentPort.on('message', async (message) => {
	try {
		if (message.type === WRITE_CACHE_TO_FILE) {
			if (functionIndexBuffer && functionIndexBuffer.isDirty()) {
				const newData = functionIndexBuffer.getNewData();
				if (newData.length > 0) {
					await cacheWriter.write('functionIndex', newData);
					functionIndexBuffer.clearNewBuffer();
				}
			}
		} else if (message.type === FLUSH_LAST_ACCESS) {
			if (lastAccessBuffer && lastAccessBuffer.isDirty()) {
				const newData = lastAccessBuffer.getNewData();
				if (newData.length > 0) {
					await cacheWriter.write('lastAccess', newData);
					lastAccessBuffer.clearNewBuffer();
				}
			}
		} else {
			logger.debug("Received unknown message type in diskWorker:", message);
		}
	} catch (err) {
		logger.error("DB write failed:", err);
	}
});


