'use strict';

const fs = require('fs');
const path = require('path');
const { parentPort } = require('worker_threads');
const { ServiceContainer } = require('../core/serviceContainer');
const { DatabaseRepository } = require('../database/databaseRepository');
const {
    WRITE_CACHE_TO_FILE,
    DELETE_ALL_CACHE,
    INIT_DB,
    DB_READY,
    DB_INIT_FAILED
} = require('../../config/constants');
const logger = require('../../utils/logger');

const container = new ServiceContainer();

let dbRepo = null;

function forceDeleteSqliteLockFile(baseDir) {
    const lockFilePath = path.join(baseDir, 'db.sqlite.lock');
    try {
        if (!fs.existsSync(lockFilePath)) { return; }

        fs.rmSync(lockFilePath, { recursive: true, force: true });
        logger.warn('[DiskWorker] Removed stale SQLite lock directory:', lockFilePath);
    } catch (err) {
        logger.warn('[DiskWorker] Failed to remove SQLite lock file:', lockFilePath, err);
    }
}

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

            const { dbPath, functionIndex, lastAccess, inodeModifiedAt, userConfig } = payload;

            if (!dbPath) {
                logger.error('[DiskWorker] Missing dbPath in write payload', payload);
                return;
            }

            try {
                // Lazily open DB in this worker process
                dbRepo.ensureOpen(dbPath, false);

                switch (type) {
                    case WRITE_CACHE_TO_FILE:
                        await dbRepo.functionCachewrite(functionIndex);
                        await dbRepo.lastaccessCachewrite(lastAccess);
                        await dbRepo.inodeModifiedAtCachewrite(inodeModifiedAt);
                        await dbRepo.userConfigCachewrite(userConfig);
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

function enqueueInit(message) {
    const requestId = message?.request_id;
    const dbPath = message?.payload?.dbPath;

    writeChain = writeChain
        .then(async () => {
            if (!dbRepo) {
                throw new Error('DiskWorker DB service not initialized');
            }
            if (!dbPath) {
                throw new Error('Missing dbPath in init payload');
            }

            forceDeleteSqliteLockFile(dbPath);
            dbRepo.ensureOpen(dbPath, false);

            parentPort.postMessage({
                type: DB_READY,
                response_id: requestId
            });
        })
        .catch((err) => {
            logger.error('[DiskWorker] DB init failed:', err);
            parentPort.postMessage({
                type: DB_INIT_FAILED,
                response_id: requestId,
                error: String(err && err.message ? err.message : err)
            });
        });
}

// Message handler: just route to the queue, do NOT await writes here
parentPort.on('message', (message) => {
    if (message.type === 'PING') {
        parentPort.postMessage({type: "PONG", response_id: message.request_id});
    } else if (message.type === INIT_DB) {
        enqueueInit(message);
    } else {
        enqueueWrite(message);
    }
});
