const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { BaseCommand } = require('../services/commands/baseCommand');
const { getDBDir } = require('../utils/vscode');
const logger = require('../utils/logger');

class WriteToCacheCommand extends BaseCommand {
    constructor(container) {
        super(container);
        this.indexerService = null;
    }

    /**
     * Initialize the command
     */
    async initialize() {
        this.indexerService = this.container.get('indexerService');
    }

    register(context) {
        const disposable = vscode.commands.registerCommand('extension.writeToCache', async () => {
            await this.execute(this.indexerService.workspacePath);
        });
        return disposable;
    }

    /**
     * Execute the clear index command
     */
    async execute(workspacePath) {
        try {
            const baseDir = getDBDir();
            if (!baseDir) {
                vscode.window.showErrorMessage("No workspace detected; cannot clear index.");
                return;
            }
            this.indexerService.writeCacheToDB();
        } catch (err) {
            logger.error("[FunctionSearch] Failed to write function index:", err);
            vscode.window.showErrorMessage("Failed to write function index. See console for details.");
        }
    }
}

module.exports = { WriteToCacheCommand };


