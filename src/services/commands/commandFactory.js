/**
 * Command Factory - Helper for creating commands
 */
class CommandFactory {
    /**
     * Create a command instance
     * @param {Class} commandClass - Command class
     * @param {ServiceContainer} container - Service container
     * @returns {BaseCommand} Command instance
     */
    static create(commandClass, container) {
        return new commandClass(container);
    }

    /**
     * Create multiple commands
     * @param {Class[]} commandClasses - Array of command classes
     * @param {ServiceContainer} container - Service container
     * @returns {BaseCommand[]} Array of command instances
     */
    static createMultiple(commandClasses, container) {
        return commandClasses.map(commandClass => new commandClass(container));
    }
}

module.exports = { CommandFactory };
