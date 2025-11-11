const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');
const { configLoader } = require('../../config/configLoader');

/**
 * Logger Service - Enhanced logging with service integration
 */
class LoggerService extends BaseService {
    constructor(container) {
        super(container);
        this.logger = logger; // Use existing logger as base
        this.context = configLoader.get('LOGGER_CONTEXT', 'FunctionSearch');
    }

    /**
     * Initialize the logger service
     */
    async initialize() {
        await super.initialize();
        logger.debug('[LoggerService] Initialized');
    }

    /**
     * Log info message
     * @param {...any} args - Log arguments
     */
    info(...args) {
        this.logger.info(`[${this.context}]`, ...args);
    }

    /**
     * Log warning message
     * @param {...any} args - Log arguments
     */
    warn(...args) {
        this.logger.warn(`[${this.context}]`, ...args);
    }

    /**
     * Log error message
     * @param {...any} args - Log arguments
     */
    error(...args) {
        this.logger.error(`[${this.context}]`, ...args);
    }

    /**
     * Log debug message
     * @param {...any} args - Log arguments
     */
    debug(...args) {
        this.logger.debug(`[${this.context}]`, ...args);
    }

    /**
     * Log trace message
     * @param {...any} args - Log arguments
     */
    trace(...args) {
        this.logger.trace(`[${this.context}]`, ...args);
    }
}

module.exports = { LoggerService };
