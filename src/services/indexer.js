const vscode = require('vscode');
const { BaseService } = require('./core/baseService');
const { getDirPath, getExtensionFromFilePath, prioritizeCurrentFileExt } = require("../utils/common");
const { initializeEnvironment, getDBDir, getWorkspacePath } = require("../utils/vscode");
const { watchForChanges } = require("./watcher");
const { WorkerManager } = require('./workerManager');
const { WorkerBus } = require('./messaging/bus');
const { FETCHED_FUNCTIONS } = require('../config/constants');
const { ACTIVE_DOC_CHANGE_DEBOUNCE_DELAY, SNAPSHOT_TO_DISK_INTERVAL, supportedExtensions, FILE_EXTRACT_FILE_PATH, MILLISECONDS_PER_DAY } = require('../config/constants');
const { configLoader } = require('../config/configLoader');

function prepareFunctionProperties(f, file, iconPath, extension) {
    return {
        label: f.name,
        lowercased_label: f.name.toLowerCase(),
        description: `${f.relativeFilePath}:${f.line}`,
        file,
        line: f.line,
        function_name: f.name,
        iconPath,
        alwaysShow: true,
        extension
    }
}


class IndexerService extends BaseService {
    constructor(container) {
        super(container);
        this.functionIndex = null;
        this.fileWorker = undefined;
        this.workspacePath = undefined;
        this.currentFileExtension = "";
        this.cachedFunctionList = [];
        this.fileToRangeMap = new Map();
        this.debounceChangeActiveDoc = null;
        this.intervalHandle = null;
        this.iconResolver = undefined;
        this.snapshotIntervalMs = configLoader.get('BUFFER_SNAPSHOT_INTERVAL', SNAPSHOT_TO_DISK_INTERVAL);
        this.logger = null;
        this.dbRepo = null;
        this.cacheWriter = null;
    }

    /**
     * Initialize the indexer service
     */
    async initialize() {
        await super.initialize();
        this.logger = this.container.get('loggerService');
        this.dbRepo = this.container.get('databaseRepository');
        this.cacheWriter = this.container.get('cacheWriterService');
        this.functionIndex = this.container.get('functionIndexBuffer');
        this.iconResolver = this.container.get('iconResolverService');
        
        this.logger.debug('[IndexerService] Initialized');
    }
    async initializeCore(context) {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {return false;}
        this.workspacePath = workspacePath;
        this.logger.debug('[Indexer] Activation with workspacePath:', this.workspacePath);
        await initializeEnvironment(context, workspacePath);
        this.iconResolver = (fileName) => vscode.Uri.joinPath(context.extensionUri, 'icons', fileName);
        const dataFromDisk = await this.loadFromDiskOnStartup();
        this.functionIndex.merge(dataFromDisk.functionIndex);
        this.globalFunctionNames = await this.getAllFunctionNames();
        this.rebuildCachedFunctionList();
        this.logger.debug('[Indexer] Cached function list size after rebuild:', this.cachedFunctionList.length);
        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            this.setCurrentFileExtension(getExtensionFromFilePath(fileName));
        }
        this.initialInodeMap = dataFromDisk.inodeModifiedAt;
        return true;
    }

    initWorkers() {
        this.fileWorker = new WorkerManager(FILE_EXTRACT_FILE_PATH, this.functionIndex);
        this.bus = new WorkerBus(this.fileWorker.worker, this.fileWorker);
        this.bus.bind();
        this.bus.on(FETCHED_FUNCTIONS, (m) => {
            const p = m.payload || {};
            this.logger.debug('[Indexer] Received fetchedFunctions for', p.filePath, 'count=', (p.functions||[]).length);
            if (p.filePath && Array.isArray(p.functions)) {
                this.functionIndex.set(p.filePath, p.functions);
                this.updateCacheHandler(p.filePath);
            }
        });
        this.bus.setInodeModifiedAt(this.initialInodeMap || new Map());
        this.logger.debug('[Indexer] Trigger initial extractFileNames for workspace');
        this.bus.extractFileNames({ workspacePath: this.workspacePath, filePath: this.workspacePath, extension: "__all__", initialLoad: true }, 'low');
    }

    attachEditorEvents() {
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) {return;}
            const document = editor.document;
            const filePath = document.fileName;
            const extension = getExtensionFromFilePath(filePath);
            if (!supportedExtensions.includes(extension)) {return;}

            if (extension !== this.currentFileExtension) {
                clearTimeout(this.debounceChangeActiveDoc);
                this.debounceChangeActiveDoc = setTimeout(() => {
                    this.setCurrentFileExtension(extension);
                }, ACTIVE_DOC_CHANGE_DEBOUNCE_DELAY);
            }

            this.logger.debug('[Indexer] onDidChangeActiveTextEditor posting extract for file:', filePath);
            this.bus.extractFileNames({ workspacePath: this.workspacePath, source: "onDidOpenfile", filePath, extension }, 'high');
            this.bus.extractFileNames({ workspacePath: this.workspacePath, source: "onDidOpenDir", filePath: getDirPath(filePath), extension }, 'high');
        });
    }

    startSnapshotTimer() {
        const interval = this.snapshotIntervalMs || SNAPSHOT_TO_DISK_INTERVAL;
        this.intervalHandle = setInterval(async () => {
            try {
                this.bus.writeCacheToFile(getDBDir());
            } catch {}
            try {
                this.bus.flushLastAccess('low');
            } catch {}
        }, interval);
    }



    async loadFromDiskOnStartup() {
        let inodeModifiedAt = new Map();
        try {
            const days = Number(process.env.FUNCTION_SEARCH_TIME_WINDOW_DAYS);
            const windowStartMs = Date.now() - (days * MILLISECONDS_PER_DAY);
            const base = getDBDir();
            const data = await this.loadStartupCache(base, windowStartMs);
            inodeModifiedAt = data.inodeModifiedAt;
            this.functionIndex.merge(data.functionIndex);
            this.logger.debug('[Indexer] Loaded from DB:', {
                inodeCount: inodeModifiedAt.size,
                functionIndexFiles: this.functionIndex.size
            });
        } catch (err) {
            this.logger.error("Failed to load DB caches:", err);
        }
        return { inodeModifiedAt, functionIndex: this.functionIndex };
    }

    /**
     * Load startup cache from database
     */
    async loadStartupCache(baseDir, windowStartMs) {
        const inodeModifiedAt = new Map();
        const functionIndex = new Map();
        try {
            const handle = this.dbRepo.ensureOpen(baseDir);
            const inodeRows = handle.prepare('SELECT fileName, inodeModifiedAt FROM file_cache').all();
            for (const r of inodeRows) {
                if (r.inodeModifiedAt != null) {inodeModifiedAt.set(r.fileName, r.inodeModifiedAt);}
            }
            const hotFilePaths = await this.getRecentFilePaths(baseDir, windowStartMs);
            for (const filePath of hotFilePaths) {
                const arr = await this.getFunctionsForFile(baseDir, filePath);
                if (arr.length > 0) {functionIndex.set(filePath, arr);}
            }
        } catch (e) {
            this.logger.error('[Indexer] loadStartupCache failed:', e);
        }
        return { inodeModifiedAt, functionIndex };
    }

    /**
     * Get recent file paths from database
     */
    async getRecentFilePaths(baseDir, windowStartMs) {
        const handle = this.dbRepo.ensureOpen(baseDir);
        try {
            const rows = handle.prepare('SELECT fileName FROM file_cache WHERE lastAccessedAt IS NOT NULL AND lastAccessedAt >= ?').all(windowStartMs);
            return rows.map(r => r.fileName);
        } catch (e) {
            this.logger.error('[Indexer] getRecentFilePaths failed:', e);
            return [];
        }
    }

    /**
     * Get functions for a specific file
     */
    async getFunctionsForFile(baseDir, filePath) {
        const handle = this.dbRepo.ensureOpen(baseDir);
        try {
            const row = handle.prepare('SELECT functions FROM file_functions WHERE fileName = ?').get(filePath);
            if (!row || !row.functions) {return [];}
            const arr = JSON.parse(row.functions);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            this.logger.error('[Indexer] getFunctionsForFile failed:', e);
            return [];
        }
    }

    /**
     * Get all function names from database
     */
    async getAllFunctionNames() {
        const handle = this.dbRepo.ensureOpen(getDBDir());
        try {
            const rows = handle.prepare('SELECT functionName FROM function_names').all();
            return rows.map(r => r.functionName);
        } catch (e) {
            this.logger.error('[Indexer] getAllFunctionNames failed:', e);
            return [];
        }
    }

    /**
     * Mark file as accessed
     */
    markFileAccessed(filePath) {
        const lastAccessBuffer = this.container.get('lastAccessBuffer');
        lastAccessBuffer.set(filePath, Date.now());
    }

    setCurrentFileExtension(ext){
        if(this.currentFileExtension === ext) {return;}
        this.currentFileExtension = ext;
        this.prioritizeCurrentFileExtHandler();
    }

    rebuildFileToRangeMap(){
        this.fileToRangeMap = new Map();
        let currentFile = null;
        let currentStart = 0;
        for (let i = 0; i < this.cachedFunctionList.length; i++) {
            const itemFile = this.cachedFunctionList[i].file;
            if (currentFile === null) {
                currentFile = itemFile;
                currentStart = i;
            } else if (itemFile !== currentFile) {
                this.fileToRangeMap.set(currentFile, { start: currentStart, end: i });
                currentFile = itemFile;
                currentStart = i;
            }
        }
        if (currentFile !== null) {
            this.fileToRangeMap.set(currentFile, { start: currentStart, end: this.cachedFunctionList.length });
        }
    }

    prioritizeCurrentFileExtHandler() {
        this.cachedFunctionList = prioritizeCurrentFileExt(this.cachedFunctionList, this.currentFileExtension);
        this.rebuildFileToRangeMap();
    }

    rebuildCachedFunctionList() {
        this.cachedFunctionList = [];
        this.fileToRangeMap.clear();
        for (const [file, functions] of this.functionIndex.entries()) {
            const ext      = getExtensionFromFilePath(file);
            const iconPath = this.iconResolver.getIconPath(ext);
            const items    = functions.map(f => prepareFunctionProperties(f, file, iconPath, ext));
            this.cachedFunctionList.push(...items);
        }
        this.prioritizeCurrentFileExtHandler();
    }

    updateCache(filePath, newFunctions) {
        const ext = getExtensionFromFilePath(filePath)
        const iconPath = this.iconResolver.getIconPath(ext)
        const newItems = newFunctions.map(f => prepareFunctionProperties(f, filePath, iconPath, ext));

        const oldRange = this.fileToRangeMap.get(filePath);
        if (oldRange) {
            this.cachedFunctionList.splice(oldRange.start, oldRange.end - oldRange.start);
            for (const [file, range] of this.fileToRangeMap.entries()) {
                if (range.start > oldRange.start) {
                    this.fileToRangeMap.set(file, {
                        start: range.start - (oldRange.end - oldRange.start),
                        end: range.end - (oldRange.end - oldRange.start)
                    });
                }
            }
        }

        const newStart = this.cachedFunctionList.length;
        this.cachedFunctionList.push(...newItems);
        this.fileToRangeMap.set(filePath, { start: newStart, end: newStart + newItems.length });
    }

    updateCacheHandler(filePath) {
        const updatedFunctions = this.functionIndex.get(filePath) || [];
        this.updateCache(filePath, updatedFunctions);
        this.prioritizeCurrentFileExtHandler();
    }


    async activate(context) {
        const ok = await this.initializeCore(context);
        if (!ok) {return;}
        this.initWorkers();
        const watcher = watchForChanges(this.workspacePath, this.functionIndex, this.bus, this.updateCacheHandler.bind(this));
        if (watcher) {
            this.watcher = watcher;
        }
        this.attachEditorEvents();
        this.startSnapshotTimer();
    }

    dispose() {
        if (this.intervalHandle) {clearInterval(this.intervalHandle);}        
        try { if (this.watcher) {this.watcher.dispose();} } catch {}
        try { 
            if (this.bus) {
                this.bus.writeCacheToFile(getDBDir());
                this.bus.flushLastAccess();
            }
        } catch {}
    }
}

module.exports = { IndexerService, prepareFunctionProperties };


