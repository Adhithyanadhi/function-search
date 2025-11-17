'use strict';

const { parentPort } = require('worker_threads');
const { ServiceContainer } = require('../core/serviceContainer');
const { DatabaseRepository } = require('../database/databaseRepository');
const { CacheWriterService } = require('../database/cacheWriterService');
const { WRITE_CACHE_TO_FILE, FLUSH_LAST_ACCESS } = require('../../config/constants');
const logger = require('../../utils/logger');

const container = new ServiceContainer();

let dbRepo = null;
let cacheWriter = null;

/**
 * Initialize services in the worker:
 * - DatabaseRepository (for SQLite access)
 * - CacheWriterService (for functionIndex / lastAccess writers)
 */
async function initializeServices() {
    try {
        container.register('databaseRepository',() => new DatabaseRepository(container),true);
        container.register('cacheWriterService', () => new CacheWriterService(container),true);

        dbRepo = container.get('databaseRepository');
        cacheWriter = container.get('cacheWriterService');

        await dbRepo.initialize();
        await cacheWriter.initialize();

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
 * type: WRITE_CACHE_TO_FILE | FLUSH_LAST_ACCESS
 * payload: { dbPath, data }
 */
function enqueueWrite(type, payload) {
    // Normalize payload
    const safePayload = payload || {};

    writeChain = writeChain
        .then(async () => {
            // Guard: services must be ready
            if (!dbRepo || !cacheWriter) {
                logger.error('[DiskWorker] Write requested before services are ready');
                return;
            }

            const { dbPath, data } = safePayload;

            if (!dbPath) {
                logger.error('[DiskWorker] Missing dbPath in write payload', data);
                return;
            }

            if (data.length === 0) {
                return;
            }

            try {
                // Lazily open DB in this worker process
                dbRepo.ensureOpen(dbPath);

                const cacheName = type === WRITE_CACHE_TO_FILE ? 'functionIndex' : 'lastAccess';

                await cacheWriter.write(cacheName, data);
            } catch (err) {
                logger.error(
                    `[DiskWorker] Failed to write ${type === WRITE_CACHE_TO_FILE ? 'functionIndex' : 'lastAccess'}:`,
                    err
                );
                // NOTE: We intentionally do NOT throw here, so the chain continues.
                // If you want retries, you can handle them here.
            }
        })
        .catch((err) => {
            // Catch any unexpected errors in the chain and keep it alive
            logger.error('[DiskWorker] Unexpected error in write chain:', err);
        });
}

// Message handler: just route to the queue, do NOT await writes here
parentPort.on('message', (message) => {
if (!message || !message.type) return;

    try {
        switch (message.type) {
            case WRITE_CACHE_TO_FILE:
                enqueueWrite(WRITE_CACHE_TO_FILE, message.payload);
                break;

            case FLUSH_LAST_ACCESS:
                enqueueWrite(FLUSH_LAST_ACCESS, message.payload);
                break;

            default:
                logger.debug('[DiskWorker] Received unknown message type:', message.type);
                break;
        }
    } catch (err) {
        logger.error('[DiskWorker] Error handling message:', err);
    }
});
