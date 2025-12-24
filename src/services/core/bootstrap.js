const { ServiceContainer } = require('./serviceContainer');
const { DatabaseRepository } = require('../database/databaseRepository');
const { CommandManager } = require('../commands/commandManager');
const { FileSystemService } = require('../utilities/fileSystemService');
const { DualBufferManager } = require('../dualBufferManager');
const { IndexerService } = require('../indexer');

/**
 * Service Bootstrap - Registers and initializes all services
 */
class ServiceBootstrap {
    constructor() {
        this.container = new ServiceContainer();
        this.initialized = false;
    }

    /**
     * Register all services with the container
     */
    registerServices() {
        // Core services
        this.container.register('fileSystemService', () => new FileSystemService(this.container), true);

        // Database services
        this.container.register('databaseRepository', () => new DatabaseRepository(this.container), true);

        // Buffer managers
        this.container.register('lastAccessBuffer', () => new DualBufferManager(this.container, 'LastAccess'), true);
        this.container.register('inodeModifiedBuffer', () => new DualBufferManager(this.container, 'InodeModfied'), true);
        this.container.register('functionIndexBuffer', () => new DualBufferManager(this.container, 'FunctionIndex'), true);

        // Command management
        this.container.register('commandManager', () => new CommandManager(this.container), true);

        // Indexer service
        this.container.register('indexerService', () => new IndexerService(this.container), true);

        console.log('[ServiceBootstrap] All services registered');
    }

    /**
     * Initialize all services
     */
    async initializeServices() {
        if (this.initialized) {
            return;
        }

        console.log('[ServiceBootstrap] Initializing services...');

        // Initialize services in dependency order
        const initOrder = [
            'fileSystemService',
            'databaseRepository',
            'lastAccessBuffer',
            'inodeModifiedBuffer',
            'functionIndexBuffer',
            'commandManager',
            'indexerService'
        ];

        for (const serviceName of initOrder) {
            try {
                const service = this.container.get(serviceName);
                if (service && typeof service.initialize === 'function') {
                    await service.initialize();
                    console.log(`[ServiceBootstrap] Initialized: ${serviceName}`);
                }
            } catch (e) {
                console.error(`[ServiceBootstrap] Failed to initialize ${serviceName}:`, e);
                throw e;
            }
        }

        this.initialized = true;
        console.log('[ServiceBootstrap] All services initialized');
    }

    /**
     * Get the service container
     * @returns {ServiceContainer} Service container
     */
    getContainer() {
        return this.container;
    }

    /**
     * Dispose all services
     */
    async dispose() {
        if (!this.initialized) {
            return;
        }

        console.log('[ServiceBootstrap] Disposing services...');
        await this.container.dispose();
        this.initialized = false;
        console.log('[ServiceBootstrap] All services disposed');
    }

    /**
     * Get service by name
     * @param {string} name - Service name
     * @returns {any} Service instance
     */
    getService(name) {
        return this.container.get(name);
    }

    /**
     * Check if service is registered
     * @param {string} name - Service name
     * @returns {boolean} True if service is registered
     */
    hasService(name) {
        return this.container.has(name);
    }

    /**
     * Get all service names
     * @returns {string[]} Array of service names
     */
    getServiceNames() {
        return this.container.getServiceNames();
    }
}

// Create global bootstrap instance
const bootstrap = new ServiceBootstrap();

module.exports = { 
    ServiceBootstrap, 
    bootstrap 
};
