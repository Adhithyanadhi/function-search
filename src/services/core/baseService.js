const logger = require('../../utils/logger');

/**
 * Base Service Class
 * All services should extend this for consistent lifecycle management
 */
class BaseService {
    constructor(container) {
        this.container = container;
        this.initialized = false;
    }

    /**
     * Initialize the service
     * Override in subclasses for custom initialization
     */
    async initialize() {
        this.initialized = true;
        logger.debug(`[BaseService] Initialized: ${this.constructor.name}`);
    }

    /**
     * Dispose the service
     * Override in subclasses for custom cleanup
     */
    async dispose() {
        this.initialized = false;
        logger.debug(`[BaseService] Disposed: ${this.constructor.name}`);
    }

    /**
     * Check if service is initialized
     */
    isInitialized() {
        return this.initialized;
    }
}

module.exports = { BaseService };
