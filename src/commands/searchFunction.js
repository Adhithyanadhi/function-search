const vscode = require('vscode');
const { BaseCommand } = require('../services/commands/baseCommand');
const { QuickPickService } = require('../services/quickpick');
const { getDBDir } = require('../utils/vscode');
const { getExtensionFromFilePath } = require('../utils/common');
const { MILLISECONDS_PER_DAY } = require('../config/constants');
const { prepareFunctionProperties } = require('../services/indexer');
const logger = require('../utils/logger');

class SearchFunctionCommand extends BaseCommand {
    constructor(container) {
        super(container);
        this.indexerService = null;
        this.fallbackCache = new Map();
        this.iconResolver = null;
    }

    /**
     * Initialize the command
     */
    async initialize() {
        this.iconResolver = this.container.get('iconResolverService');
        // Get indexer service from container
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

            const fallbackProvider = async (lcQuery) => {
                try {
                    // Check cache first
                    if (this.fallbackCache.has(lcQuery)) {
                        return this.fallbackCache.get(lcQuery);
                    }

                    const days = Number(process.env.FUNCTION_SEARCH_TIME_WINDOW_DAYS);
                    const windowStartMs = Date.now() - (days * MILLISECONDS_PER_DAY);
                    const limit = Number(process.env.FUNCTION_SEARCH_MAX_SQL_CANDIDATES);
                    const names = this.indexerService.globalFunctionNames
                        .filter(n => n && n.toLowerCase().includes(lcQuery[0]))
                        .slice(0, limit);
                    if (names.length === 0) {return [];}
                    const rows = await this.searchFallbackCandidates(getDBDir(), windowStartMs, names, limit);
                    const out = [];
                    for (const r of rows) {
                        let arr = [];
                        try { arr = JSON.parse(r.functions || '[]'); } catch {}
                        if (!Array.isArray(arr)) {continue;}
                        for (const f of arr) {
                            if (!f || !f.name) {continue;}
                            const nameLc = f.name.toLowerCase();
                            if (!lcQuery || !nameLc) {continue;}
                            if (nameLc.includes(lcQuery[0])) {
                                const extension = getExtensionFromFilePath(r.filePath);
                                const iconPath = this.iconResolver.getIconPath(extension);
                                const functionProps = prepareFunctionProperties(f, r.filePath, iconPath, extension);
                                out.push(functionProps);
                                
                                // Store discovered function in buffer
                                this.indexerService.functionIndex.set(r.filePath, this.indexerService.functionIndex.get(r.filePath) || []);
                                const existingFunctions = this.indexerService.functionIndex.get(r.filePath);
                                if (!existingFunctions.some(existing => existing.name === f.name)) {
                                    existingFunctions.push(f);
                                }
                            }
                        }
                        if (out.length >= limit) {break;}
                    }
                    
                    // Cache the results
                    this.fallbackCache.set(lcQuery, out);
                    return out;
                } catch { return []; }
            };

            QuickPickService.showFunctionSearchQuickPick(this.indexerService.cachedFunctionList, this.indexerService.currentFileExtension, fallbackProvider, (filePath) => {
                this.indexerService.markFileAccessed(filePath);
            });
        });
        context.subscriptions.push(disposable);
    }

    /**
     * Search fallback candidates
     */
    async searchFallbackCandidates(baseDir, windowStartMs, names, limit) {
        const dbRepo = this.container.get('databaseRepository');
        const handle = dbRepo.db;
        if (!Array.isArray(names) || names.length === 0) {return [];}
        const capped = names.slice(0, limit);

        const candidateFilePaths = await this.getCandidateFilePathsForFallback(handle, capped, windowStartMs, limit);
        if (candidateFilePaths.length === 0) {return [];}
        return await this.fetchFunctionBlobsForFiles(handle, candidateFilePaths, limit);
    }

    /**
     * Get candidate file paths for fallback search
     */
    async getCandidateFilePathsForFallback(handle, names, windowStartMs, limit) {
        const inPlaceholders = names.map(() => '?').join(',');
        const candidateFilePathsQuery = `
            SELECT DISTINCT fo.fileName AS filePath
            FROM function_occurrences fo
            JOIN file_cache fc ON fc.fileName = fo.fileName
            WHERE fo.functionName IN (${inPlaceholders})
              AND (fc.lastAccessedAt IS NULL OR fc.lastAccessedAt < ?)
            LIMIT ?
        `;
        try {
            const rows = handle.prepare(candidateFilePathsQuery).all(...names, windowStartMs, limit);
            return rows.map(r => r.filePath);
        } catch (e) {
            logger.error('[SearchFunctionCommand] getCandidateFilePathsForFallback failed:', e);
            return [];
        }
    }

    /**
     * Fetch function blobs for files
     */
    async fetchFunctionBlobsForFiles(handle, filePaths, limit) {
        const out = [];
        const chunkSize = 200;
        for (let i = 0; i < filePaths.length; i += chunkSize) {
            const chunk = filePaths.slice(i, i + chunkSize);
            const stmt = this.getSelectByFilePathsStmt(handle, chunk.length);
            try {
                const rows = stmt.all(...chunk);
                out.push(...rows);
            } catch (e) {
                logger.error('[SearchFunctionCommand] fetchFunctionBlobsForFiles failed:', e);
            }
            if (out.length >= limit) {break;}
        }
        return out.slice(0, limit);
    }

    /**
     * Get prepared statement for selecting by file paths
     */
    getSelectByFilePathsStmt(dbHandle, n) {
        const placeholders = new Array(n).fill('?').join(',');
        const query = `SELECT fileName AS filePath, functions FROM file_functions WHERE fileName IN (${placeholders})`;
        return dbHandle.prepare(query);
    }
}

module.exports = { SearchFunctionCommand };


