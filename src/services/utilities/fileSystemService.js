const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');
const { configLoader } = require('../../config/configLoader');

/**
 * File System Service - Enhanced file operations with caching
 */
class FileSystemService extends BaseService {
    constructor(container) {
        super(container);
        this.fs = require('fs');
        this.path = require('path');
        this.cache = new Map();
        this.cacheEnabled = configLoader.get('FILESYSTEM_CACHE_ENABLED', true);
    }

    /**
     * Initialize the file system service
     */
    async initialize() {
        await super.initialize();
        logger.debug('[FileSystemService] Initialized');
    }

    /**
     * Read file with caching
     * @param {string} filePath - File path
     * @param {string} encoding - File encoding
     * @returns {Promise<string>} File content
     */
    async readFile(filePath, encoding = 'utf8') {
        const cacheKey = `read:${filePath}:${encoding}`;
        
        if (this.cacheEnabled && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const content = await this.fs.promises.readFile(filePath, encoding);
            
            if (this.cacheEnabled) {
                this.cache.set(cacheKey, content);
            }
            
            return content;
        } catch (e) {
            logger.error(`[FileSystemService] Failed to read file ${filePath}:`, e);
            throw e;
        }
    }

    /**
     * Write file
     * @param {string} filePath - File path
     * @param {string} content - File content
     * @param {string} encoding - File encoding
     */
    async writeFile(filePath, content, encoding = 'utf8') {
        try {
            await this.fs.promises.writeFile(filePath, content, encoding);
            
            // Invalidate cache for this file
            if (this.cacheEnabled) {
                this.invalidateCache(filePath);
            }
        } catch (e) {
            logger.error(`[FileSystemService] Failed to write file ${filePath}:`, e);
            throw e;
        }
    }

    /**
     * Check if file exists
     * @param {string} filePath - File path
     * @returns {Promise<boolean>} True if file exists
     */
    async exists(filePath) {
        const cacheKey = `exists:${filePath}`;
        
        if (this.cacheEnabled && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const exists = await this.fs.promises.access(filePath).then(() => true).catch(() => false);
            
            if (this.cacheEnabled) {
                this.cache.set(cacheKey, exists);
            }
            
            return exists;
        } catch (e) {
            logger.error(`[FileSystemService] Failed to check existence of ${filePath}:`, e);
            return false;
        }
    }

    /**
     * Create directory recursively
     * @param {string} dirPath - Directory path
     */
    async mkdir(dirPath) {
        try {
            await this.fs.promises.mkdir(dirPath, { recursive: true });
        } catch (e) {
            logger.error(`[FileSystemService] Failed to create directory ${dirPath}:`, e);
            throw e;
        }
    }

    /**
     * Invalidate cache for a file
     * @param {string} filePath - File path
     * @private
     */
    invalidateCache(filePath) {
        for (const [key] of this.cache) {
            if (key.includes(filePath)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache.clear();
        logger.debug('[FileSystemService] Cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            enabled: this.cacheEnabled
        };
    }

    /**
     * Dispose the service
     */
    async dispose() {
        this.cache.clear();
        await super.dispose();
    }
}

module.exports = { FileSystemService };
