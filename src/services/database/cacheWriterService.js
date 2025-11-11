const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');
const { LastAccessCacheWriter } = require('./lastAccessCacheWriter');
const { FunctionIndexCacheWriter } = require('./functionIndexCacheWriter');

/**
 * Cache Writer Service - Strategy Pattern Coordinator
 */
class CacheWriterService extends BaseService {
    constructor(container) {
        super(container);
        this.writers = new Map();
        this.repository = null;
    }

    /**
     * Initialize the cache writer service
     */
    async initialize() {
        await super.initialize();
        this.repository = this.container.get('databaseRepository');
        this.registerWriters();
        logger.debug('[CacheWriterService] Initialized');
    }

    /**
     * Register cache writers
     * @private
     */
    registerWriters() {
        this.writers.set('lastAccess', new LastAccessCacheWriter(this.repository));
        this.writers.set('functionIndex', new FunctionIndexCacheWriter(this.repository));
    }

    /**
     * Write data to cache using appropriate writer
     * @param {string} cacheType - Type of cache
     * @param {any} data - Data to write
     */
    async write(cacheType, data) {
        const writer = this.writers.get(cacheType);
        if (!writer) {
            throw new Error(`Unknown cache type: ${cacheType}`);
        }

        try {
            await writer.write(data);
        } catch (e) {
            logger.error(`[CacheWriterService] Failed to write ${cacheType}:`, e);
            throw e;
        }
    }

    /**
     * Get available cache types
     * @returns {string[]} Available cache types
     */
    getCacheTypes() {
        return Array.from(this.writers.keys());
    }
}

module.exports = { CacheWriterService };
