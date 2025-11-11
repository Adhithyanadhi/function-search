/**
 * Base Command Class - Template for all commands
 */
class BaseCommand {
    constructor(container) {
        this.container = container;
        this.services = container;
    }

    /**
     * Execute the command
     * Must be implemented by subclasses
     * @param {...any} args - Command arguments
     * @returns {Promise<any>} Command result
     */
    async execute(..._args) {
        throw new Error('execute() must be implemented by subclass');
    }

    /**
     * Register the command with VSCode
     * Must be implemented by subclasses
     * @param {vscode.ExtensionContext} context - VSCode extension context
     * @returns {vscode.Disposable} Command disposable
     */
    register(_context) {
        throw new Error('register() must be implemented by subclass');
    }

    /**
     * Get command metadata
     * @returns {Object} Command metadata
     */
    getMetadata() {
        return {
            name: this.constructor.name,
            description: 'No description provided'
        };
    }
}

module.exports = { BaseCommand };
