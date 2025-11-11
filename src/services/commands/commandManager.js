const logger = require('../../utils/logger');
const { BaseService } = require('../core/baseService');

/**
 * Command Manager - Manages all commands
 */
class CommandManager extends BaseService {
    constructor(container) {
        super(container);
        this.commands = new Map();
        this.context = null;
        this.vscode = null;
    }

    /**
     * Initialize the command manager
     */
    async initialize() {
        await super.initialize();
        this.vscode = require('vscode');
        logger.debug('[CommandManager] Initialized');
    }

    /**
     * Register a command
     * @param {string} name - Command name
     * @param {Class} commandClass - Command class
     * @returns {BaseCommand} Command instance
     */
    registerCommand(name, commandClass) {
        const command = new commandClass(this.container);
        this.commands.set(name, command);
        logger.debug(`[CommandManager] Registered command: ${name}`);
        return command;
    }

    /**
     * Register all commands with VSCode
     * @param {vscode.ExtensionContext} context - VSCode extension context
     */
    registerWithVSCode(context) {
        this.context = context;
        
        for (const [name, command] of this.commands) {
            try {
                const disposable = command.register(context);
                context.subscriptions.push(disposable);
                logger.debug(`[CommandManager] Registered ${name} with VSCode`);
            } catch (e) {
                logger.error(`[CommandManager] Failed to register ${name}:`, e);
            }
        }
    }

    /**
     * Execute a command
     * @param {string} name - Command name
     * @param {...any} args - Command arguments
     * @returns {Promise<any>} Command result
     */
    async execute(name, ...args) {
        const command = this.commands.get(name);
        if (!command) {
            throw new Error(`Command '${name}' not found`);
        }

        try {
            logger.debug(`[CommandManager] Executing command: ${name}`);
            return await command.execute(...args);
        } catch (e) {
            logger.error(`[CommandManager] Error executing ${name}:`, e);
            throw e;
        }
    }

    /**
     * Get all registered commands
     * @returns {Map} Map of commands
     */
    getCommands() {
        return this.commands;
    }

    /**
     * Get command metadata
     * @returns {Object[]} Array of command metadata
     */
    getCommandMetadata() {
        const metadata = [];
        for (const [name, command] of this.commands) {
            metadata.push({
                name,
                ...command.getMetadata()
            });
        }
        return metadata;
    }

    /**
     * Dispose the command manager
     */
    async dispose() {
        this.commands.clear();
        this.context = null;
        await super.dispose();
    }
}

module.exports = { CommandManager };
