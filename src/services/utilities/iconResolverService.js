const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');

/**
 * Icon Resolver Service - Enhanced icon management
 */
class IconResolverService extends BaseService {
    constructor(container) {
        super(container);
        this.iconCache = new Map();
        this.iconPaths = new Map();
    }

    /**
     * Initialize the icon resolver service
     */
    async initialize() {
        await super.initialize();
        this.loadDefaultIcons();
        logger.debug('[IconResolverService] Initialized');
    }

    /**
     * Load default icon mappings
     * @private
     */
    loadDefaultIcons() {
        const defaultIcons = {
            'js': 'js.svg',
            'ts': 'ts.svg',
            'py': 'py.svg',
            'java': 'java.svg',
            'go': 'go.svg',
            'rs': 'rs.svg',
            'rb': 'rb.svg'
        };

        for (const [extension, iconFile] of Object.entries(defaultIcons)) {
            this.registerIcon(extension, iconFile);
        }
    }

    /**
     * Register an icon for an extension
     * @param {string} extension - File extension
     * @param {string} iconPath - Icon file path
     */
    registerIcon(extension, iconPath) {
        this.iconPaths.set(extension, iconPath);
        logger.debug(`[IconResolverService] Registered icon for ${extension}: ${iconPath}`);
    }

    /**
     * Get icon path for an extension
     * @param {string} extension - File extension
     * @returns {string} Icon path
     */
    getIconPath(extension) {
        if (this.iconCache.has(extension)) {
            return this.iconCache.get(extension);
        }

        const iconPath = this.iconPaths.get(extension) || 'icon.png';
        this.iconCache.set(extension, iconPath);
        
        return iconPath;
    }

    /**
     * Get all registered extensions
     * @returns {string[]} Array of extensions
     */
    getRegisteredExtensions() {
        return Array.from(this.iconPaths.keys());
    }

    /**
     * Clear icon cache
     */
    clearCache() {
        this.iconCache.clear();
        logger.debug('[IconResolverService] Cache cleared');
    }

    /**
     * Dispose the service
     */
    async dispose() {
        this.iconCache.clear();
        this.iconPaths.clear();
        await super.dispose();
    }
}

module.exports = { IconResolverService };
