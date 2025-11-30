const logger = require('../utils/logger');
const { BaseService } = require('./core/baseService');
const { configLoader } = require('../config/configLoader');

/**
 * DualBufferManager - Unified buffer system for efficient data management
 * 
 * Maintains two buffers:
 * - primaryBuffer: Main working buffer (fast lookups)
 * - newBuffer: Buffer for new/updated data (minimal DB writes)
 * 
 * Usage:
 * - All lookups check both buffers
 * - Updates go to both buffers
 * - DB writes only flush newBuffer
 */
class DualBufferManager extends BaseService {
    constructor(container, name = 'DualBuffer') {
        super(container);
        this.name = name;
        this.primaryBuffer = new Map();
        this.newBuffer = new Map();
        this.dirty = false;
        this.maxSize = configLoader.get('BUFFER_MAX_SIZE', 10000);
    }

    /**
     * Initialize the buffer manager
     */
    async initialize() {
        await super.initialize();
        logger.debug(`[${this.name}] Initialized with max size: ${this.maxSize}`);
    }

    /**
     * Get value from either buffer (primary first, then new)
     */
    get(key) {
        return this.primaryBuffer.get(key) || this.newBuffer.get(key);
    }

    /**
     * Set value in both buffers
     */
    set(key, value) {
        this.primaryBuffer.set(key, value);
        this.newBuffer.set(key, value);
        this.dirty = true;
        
        // Check if we need to trim the buffer
        this.checkAndTrim();
        
        logger.debug(`[${this.name}] Set ${key}, dirty: ${this.dirty}, size: ${this.getTotalSize()}`);
    }

    /**
     * Check if buffer needs trimming and trim if necessary
     * @private
     */
    checkAndTrim() {
        if (this.getTotalSize() > this.maxSize) {
            this.trimBuffer();
        }
    }

    /**
     * Trim the buffer by removing oldest entries from primary buffer
     * @private
     */
    trimBuffer() {
        const entriesToRemove = this.getTotalSize() - this.maxSize;
        if (entriesToRemove <= 0) {
            return;
        }

        const primaryEntries = Array.from(this.primaryBuffer.entries());
        const entriesToKeep = primaryEntries.slice(entriesToRemove);
        
        this.primaryBuffer.clear();
        for (const [key, value] of entriesToKeep) {
            this.primaryBuffer.set(key, value);
        }
        
        logger.debug(`[${this.name}] Trimmed buffer, removed ${entriesToRemove} entries`);
    }

    /**
     * Check if key exists in primary buffer
     */
    has(key) {
        return this.primaryBuffer.has(key);
    }

    /**
     * Delete from both buffers
     */
    delete(key) {
        const hadPrimary = this.primaryBuffer.delete(key);
        const hadNew = this.newBuffer.delete(key);
        if (hadPrimary || hadNew) {
            this.dirty = true;
        }
        return hadPrimary || hadNew;
    }

    /**
     * Get all entries from primary buffer
     */
    entries() {
        return this.primaryBuffer.entries();
    }

    /**
     * Get all keys from primary buffer
     */
    keys() {
        return this.primaryBuffer.keys();
    }

    /**
     * Get all values from primary buffer
     */
    values() {
        return this.primaryBuffer.values();
    }

    toMap() {
        const out = new Map(this.primaryBuffer);
        for (const [key, value] of this.newBuffer.entries()) {
            out.set(key, value);
        }
        return out;
    }

    /**
     * Get size of primary buffer
     */
    get size() {
        return this.primaryBuffer.size;
    }

    /**
     * Check if there's new data to flush
     */
    isDirty() {
        return this.dirty && this.newBuffer.size > 0;
    }

    /**
     * Get new buffer data for flushing
     */
    getNewData() {
        return Array.from(this.newBuffer.entries());
    }

    /**
     * Clear new buffer after successful flush
     */
    clearNewBuffer() {
        this.newBuffer.clear();
        this.dirty = false;
        logger.debug(`[${this.name}] Cleared new buffer, dirty: ${this.dirty}`);
    }

    /**
     * Clear both buffers
     */
    clear() {
        this.primaryBuffer.clear();
        this.newBuffer.clear();
        this.dirty = false;
    }

    /**
     * Merge external data into both buffers
     */
    merge(data) {
        for (const [key, value] of data.entries()) {
            this.set(key, value);
        }
    }

    /**
     * Get combined size of both buffers
     */
    getTotalSize() {
        return this.primaryBuffer.size + this.newBuffer.size;
    }

    /**
     * Get debug info
     */
    getDebugInfo() {
        return {
            name: this.name,
            primarySize: this.primaryBuffer.size,
            newSize: this.newBuffer.size,
            dirty: this.dirty,
            isDirty: this.isDirty()
        };
    }
}

module.exports = { DualBufferManager };
