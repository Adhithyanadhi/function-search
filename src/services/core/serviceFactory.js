/**
 * Service Factory - Helper for creating service instances
 */
class ServiceFactory {
    /**
     * Create a service instance
     * @param {Class} serviceClass - Service class
     * @param {ServiceContainer} container - Service container
     * @returns {BaseService} Service instance
     */
    static create(serviceClass, container) {
        return new serviceClass(container);
    }

    /**
     * Create multiple services
     * @param {Class[]} serviceClasses - Array of service classes
     * @param {ServiceContainer} container - Service container
     * @returns {BaseService[]} Array of service instances
     */
    static createMultiple(serviceClasses, container) {
        return serviceClasses.map(serviceClass => new serviceClass(container));
    }
}

module.exports = { ServiceFactory };
