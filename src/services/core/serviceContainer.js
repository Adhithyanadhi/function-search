const logger = require('../../utils/logger');

/**
 * Service Container - Dependency Injection Container
 * 
 * Manages service lifecycle and dependencies using factory pattern
 * Supports singleton and transient service registration
 */
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.instances = new Map();
    }

    /**
     * Register a service with the container
     * @param {string} name - Service name
     * @param {Function} factory - Factory function that creates the service
     * @param {boolean} singleton - Whether to create as singleton
     */
    register(name, factory, singleton = false) {
        this.services.set(name, { factory, singleton });
        logger.debug(`[ServiceContainer] Registered service: ${name} (singleton: ${singleton})`);
    }

    /**
     * Get a service instance from the container
     * @param {string} name - Service name
     * @returns {any} Service instance
     */
    get(name) {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service '${name}' not registered`);
        }

        if (service.singleton) {
            if (!this.singletons.has(name)) {
                this.singletons.set(name, service.factory(this));
            }
            return this.singletons.get(name);
        }

        return service.factory(this);
    }

    /**
     * Check if a service is registered
     * @param {string} name - Service name
     * @returns {boolean}
     */
    has(name) {
        return this.services.has(name);
    }

    /**
     * Get all registered service names
     * @returns {string[]}
     */
    getServiceNames() {
        return Array.from(this.services.keys());
    }

    /**
     * Clear all services (useful for testing)
     */
    clear() {
        this.services.clear();
        this.singletons.clear();
        this.instances.clear();
    }

    /**
     * Dispose all singleton services
     */
    async dispose() {
        for (const [name, instance] of this.singletons) {
            if (instance && typeof instance.dispose === 'function') {
                try {
                    await instance.dispose();
                } catch (e) {
                    logger.error(`[ServiceContainer] Error disposing service ${name}:`, e);
                }
            }
        }
        this.clear();
    }
}

module.exports = { ServiceContainer };