const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { BaseCommand } = require('../services/commands/baseCommand');
const { getDBDir } = require('../utils/vscode');

class ClearIndexCommand extends BaseCommand {
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

    register(context, workspacePath) {
        const disposable = vscode.commands.registerCommand('function-name-search.clearIndex', async () => {
            await this.execute(workspacePath);
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
            try {
                if (fs.existsSync(dbFile)) {
                    await fs.promises.unlink(dbFile);
                }
            } catch (e) {
                logger.error("[FunctionSearch] Failed deleting db file:", e);
            }

            this.indexerService.functionIndex.clear();
            this.indexerService.cachedFunctionList = [];
            this.indexerService.fileToRangeMap.clear();
            this.indexerService.prioritizeCurrentFileExtHandler();

            vscode.window.showInformationMessage("Function index cleared. Reindexing...");
            if (this.indexerService.bus && workspacePath) {
                this.indexerService.bus.setInodeModifiedAt(new Map(), 'high');
                this.indexerService.bus.extractFileNames({ workspacePath, filePath: workspacePath, extension: "__all__", initialLoad: true }, 'high');
            }
        } catch (err) {
            logger.error("[FunctionSearch] Failed to clear function index:", err);
            vscode.window.showErrorMessage("Failed to clear function index. See console for details.");
        }
    }
}

module.exports = { ClearIndexCommand };


