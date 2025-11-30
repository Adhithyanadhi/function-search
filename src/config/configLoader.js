const fs = require('fs');
const path = require('path');

/**
 * Simple configuration loader for .env file
 * Replaces the complex ConfigurationService with a lightweight solution
 */
class ConfigLoader {
    constructor() {
        this.config = {};
        this.envPath = path.join(__dirname, '.env');
    }

    /**
     * Load configuration from .env file
     */
    load() {
        try {
            if (!fs.existsSync(this.envPath)) {
                console.warn(`[ConfigLoader] .env file not found at ${this.envPath}, using defaults`);
                this.loadDefaults();
                return;
            }

            const envContent = fs.readFileSync(this.envPath, 'utf8');
            const lines = envContent.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();
                
                // Skip empty lines and comments
                if (!trimmedLine || trimmedLine.startsWith('#')) {
                    continue;
                }

                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    let value = valueParts.join('=').trim();
                    
                    // Parse numeric values
                    if (!isNaN(value) && value !== '') {
                        value = Number(value);
                    }
                    
                    // Parse boolean values
                    if (value === 'true') {
                        value = true;
                    }
                    if (value === 'false') {
                        value = false;
                    }
                    
                    // Parse arrays (comma-separated) - only if value is still a string
                    if (typeof value === 'string' && value.includes(',') && !value.startsWith('"')) {
                        value = value.split(',').map(item => item.trim());
                    }
                    
                    this.config[key] = value;
                }
            }

        } catch (error) {
            console.error('[ConfigLoader] Error loading .env file:', error);
            this.loadDefaults();
        }
    }

    /**
     * Load default configuration values
     */
    loadDefaults() {
        this.config = {
            DATABASE_PATH: '',
            DATABASE_JOURNAL_MODE: 'WAL',
            DATABASE_SYNCHRONOUS: 'NORMAL',
            DATABASE_PAGE_SIZE: 8192,
            DATABASE_MMAP_SIZE: 268435456,
            BUFFER_SNAPSHOT_INTERVAL: 30000,
            BUFFER_MAX_SIZE: 10000,
            WORKER_MAX_WORKERS: 4,
            WORKER_BATCH_SIZE: 100,
            SEARCH_MAX_RESULTS: 1000,
            SEARCH_CACHE_SIZE: 100,
            WATCHER_DEBOUNCE_DELAY: 300,
            WATCHER_EXCLUDE_PATTERNS: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
            LOGGER_CONTEXT: 'FunctionSearch',
            FILESYSTEM_CACHE_ENABLED: true
        };
    }

    /**
     * Get a configuration value
     * @param {string} key - Configuration key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Configuration value
     */
    get(key, defaultValue = null) {
        return this.config[key] ?? defaultValue;
    }

    /**
     * Get all configuration as an object
     * @returns {Object} Configuration object
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Check if a configuration key exists
     * @param {string} key - Configuration key
     * @returns {boolean} True if key exists
     */
    has(key) {
        return key in this.config;
    }
}

// Create singleton instance
const configLoader = new ConfigLoader();
configLoader.load();

module.exports = { ConfigLoader, configLoader };
