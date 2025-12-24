const vscode = require('vscode');
const { BaseCommand } = require('../services/commands/baseCommand');
const { QuickPickService } = require('../services/quickpick');
const { getDBDir } = require('../utils/vscode');
const { getExtensionFromFilePath } = require('../utils/common');
const { MILLISECONDS_PER_DAY } = require('../config/constants');
const { prepareFunctionProperties } = require('../services/indexer');
const logger = require('../utils/logger');
const { isSubsequence } = require('../utils/common');

class SearchFunctionCommand extends BaseCommand {
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
        const disposable = vscode.commands.registerCommand('extension.searchFunction', async () => {
            if (this.indexerService.functionIndex.size === 0) {
                try {
                    if (this.indexerService.bus && this.indexerService.workspacePath) {
                        this.indexerService.bus.extractFileNames({
                            workspacePath: this.indexerService.workspacePath,
                            filePath: this.indexerService.workspacePath,
                            extension: '__all__',
                            initialLoad: true,
                        }, 'low');
                    }
                } catch {}
                vscode.window.showInformationMessage("Indexing functions... try again in a moment.");
                return;
            }

            if (this.indexerService.cachedFunctionList.length === 0) {
                this.indexerService.rebuildCachedFunctionList();
            }

            const fallbackProvider = async (queryTerm) => {
                try {
                    if (!queryTerm) {
                        // check whether to return this.indexerservice.functionIndex full
                        return [];
                    }

                    // Initialize time window once
                    if (this.fallbackWindowStartMs == null) {
                        const days = Number(process.env.FUNCTION_SEARCH_TIME_WINDOW_DAYS);
                        this.fallbackWindowStartMs = Date.now() - (days * MILLISECONDS_PER_DAY);
                    }

                    const baseDir = getDBDir();

                    const matches = [];
                    const limit = Number(process.env.FUNCTION_SEARCH_MAX_SQL_CANDIDATES);

                    // Safety: don’t loop forever in a bug
                    let fallbackOffset = 0;
                    while (matches.length === 0) {

                        // 1. candidate_fn_list = fetch next set of files with lastAccessedAt < time
                        
                        const rows = await this.indexerService.dbRepo.getOlderFileCache(this.fallbackWindowStartMs, limit, fallbackOffset); 

                        // Advance offset for next time
                        fallbackOffset += limit;

                        for (const r of rows) {
                            let functions = [];
                            try {
                                functions = JSON.parse(r.functions);
                            } catch {
                                continue;
                            }
                            if (functions == null || functions.length === 0) {
                                continue;
                            }

                            // 2. Update functionIndex with this candidate list
                            //    so we never have to fetch this file again.
                            this.indexerService.functionIndex.set(r.file_name, functions);

                            // 3. matching_list = for fn in candidate_fn_list : check for lcs
                            const extension = getExtensionFromFilePath(r.file_name);

                            for (const [fnName, f] of Object.entries(functions ?? {})) {
                                if (isSubsequence(queryTerm, fnName.toLowerCase())) {
                                    matches.push(f);
                                }
                            }
                        }

                        // 4. if matching_list > 0 return; else loop to next batch
                        if (!rows || rows.length === 0 || rows.length < limit || matches.length > 0) {
                            break;
                        }
                    }

                    return matches;
                } catch (err) {
                    console.error('[SearchFunctionCommand] fallbackProvider error:', err);
                    return [];
                }
            };

            QuickPickService.showFunctionSearchQuickPick(this.indexerService.cachedFunctionList, this.indexerService.currentFileExtension, fallbackProvider, (filePath) => {
                    this.indexerService.markFileAccessed(filePath);
            });
        });
        context.subscriptions.push(disposable);
    }
}

module.exports = { SearchFunctionCommand };
