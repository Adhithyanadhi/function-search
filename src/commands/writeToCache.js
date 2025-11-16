const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { BaseCommand } = require('../services/commands/baseCommand');
const { getDBDir } = require('../utils/vscode');

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

            const dbFile = path.join(baseDir, 'db.sqlite');
            console.log("dbfile path", dbFile);
            this.indexerService.bus.writeCacheToFile(getDBDir());
            console.log("dbfile path sucess", dbFile);

        } catch (err) {
            logger.error("[FunctionSearch] Failed to clear function index:", err);
            vscode.window.showErrorMessage("Failed to clear function index. See console for details.");
        }
    }
}

module.exports = { WriteToCacheCommand };


