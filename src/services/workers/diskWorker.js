'use strict';

const { parentPort } = require('worker_threads');
const { ServiceContainer } = require('../core/serviceContainer');
const { DatabaseRepository } = require('../database/databaseRepository');
const { WRITE_CACHE_TO_FILE, DELETE_ALL_CACHE } = require('../../config/constants');
const logger = require('../../utils/logger');

const container = new ServiceContainer();

let dbRepo = null;

async function initializeServices() {
    try {
        container.register('databaseRepository',() => new DatabaseRepository(container),true);

        dbRepo = container.get('databaseRepository');

        await dbRepo.initialize();

        logger.debug('[DiskWorker] Services initialized');
    } catch (err) {
        logger.error('[DiskWorker] Failed to initialize services:', err);
    }
}

// Start initialization immediately
const initPromise = initializeServices().catch((err) => {
    logger.error('[DiskWorker] Initialization error:', err);
});

/**
 * Single-writer queue:
 *
 * We chain all write jobs onto this Promise so that only ONE
 * write is active at any time, even though the worker receives
 * multiple messages.
 *
 * Any new job waits for the previous job (and init) to complete.
 */
let writeChain = initPromise;

/**
 * Enqueue a write job (functionIndex or lastAccess).
 * type: WRITE_CACHE_TO_FILE 
 * payload: { dbPath, data }
 */
function enqueueWrite(message) {
    const {type, payload} = message;

    writeChain = writeChain
        .then(async () => {
            // Guard: services must be ready
            if (!dbRepo) {
                logger.error('[DiskWorker] Write requested before services are ready');
                return;
            }

            const { dbPath, functionIndex, lastAccess } = payload;

            if (!dbPath) {
                logger.error('[DiskWorker] Missing dbPath in write payload', data);
                return;
            }

            try {
                // Lazily open DB in this worker process
                dbRepo.ensureOpen(dbPath, false);

                switch (type) {
                    case WRITE_CACHE_TO_FILE:
                        await dbRepo.functionCachewrite(functionIndex);
                        await dbRepo.lastaccessCachewrite(lastAccess);
                        break;

                    case DELETE_ALL_CACHE:
                        dbRepo.deleteAllCache();
                        break;

                    default:
                        logger.debug('[DiskWorker] Received unknown message type:', message.type);
                        break;
                }

            } catch (err) {
                logger.error(
                    `[DiskWorker] Failed to write ${message}:`,
                    err
                );
                // NOTE: We intentionally do NOT throw here, so the chain continues.
                // If you want retries, you can handle them here.
            }
        })
        .catch((err) => {
            // Catch any unexpected errors in the chain and keep it alive
            logger.error('[DiskWorker] Unexpected error in write chain:', err, message);
        });
}

// Message handler: just route to the queue, do NOT await writes here
parentPort.on('message', (message) => {
if (!message || !message.type) return;
    enqueueWrite(message);
});
