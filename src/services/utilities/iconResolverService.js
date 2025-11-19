const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');
const { getExtensionUri } = require('../../utils/vscode');
const { FILE_PROPERTIES } = require('../../config/constants');
const vscode = require('vscode');


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
        this.registerIcons();
        logger.debug('[IconResolverService] Initialized');
    }

    registerIcons() {
        const extensionUri = getExtensionUri();
        Object.entries(FILE_PROPERTIES).forEach(([extension, val]) => {
            if(val.fileIcon){
                const uri = vscode.Uri.joinPath(extensionUri, 'icons', val.fileIcon);
                this.iconPaths.set(extension, uri);
                logger.debug(`[IconResolverService] Registered icon for ${extension}: ${val.fileIcon} :${uri}`);
            }
        });
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
