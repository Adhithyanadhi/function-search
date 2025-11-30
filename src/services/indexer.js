const vscode = require('vscode');
const { BaseService } = require('./core/baseService');
const { getDirPath, getExtensionFromFilePath, prioritizeCurrentFileExt, resetInterval } = require("../utils/common");
const { initializeEnvironment, getDBDir, getWorkspacePath } = require("../utils/vscode");
const { watchForChanges } = require("./watcher");
const { WorkerManager } = require('./workerManager');
const { Worker } = require('worker_threads');
const { WorkerBus } = require('./messaging/bus');
const { FETCHED_FUNCTIONS } = require('../config/constants');
const {   WRITE_CACHE_TO_FILE, DELETE_ALL_CACHE, DISK_WORKER_FILE_PATH, ACTIVE_DOC_CHANGE_DEBOUNCE_DELAY, SNAPSHOT_TO_DISK_INTERVAL, supportedExtensions, FILE_EXTRACT_FILE_PATH, MILLISECONDS_PER_DAY } = require('../config/constants');
const { configLoader } = require('../config/configLoader');
const logger = require('../utils/logger');


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
        this.lastAccessIndex = null;
        this.fileWorker = undefined;
        this.diskWorker = undefined;
        this.workspacePath = undefined;
        this.currentFileExtension = "";
        this.cachedFunctionList = [];
        this.fileToRangeMap = new Map();
        this.debounceChangeActiveDoc = null;
        this.flushToDBIntervalHandle = null;
        this.iconResolver = undefined;
        this.dbRepo = null;
    }

    /**
     * Initialize the indexer service
     */
    async initialize() {
        await super.initialize();
        this.dbRepo = this.container.get('databaseRepository');
        this.functionIndex = this.container.get('functionIndexBuffer');
        this.lastAccessIndex = this.container.get('lastAccessBuffer');
        this.iconResolver = this.container.get('iconResolverService');
        
        logger.debug('[IndexerService] Initialized');
    }

    async initializeCore(context) {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {return false;}
        this.workspacePath = workspacePath;
        logger.debug('[Indexer] Activation with workspacePath:', this.workspacePath);
        await initializeEnvironment(context, workspacePath);
        const dataFromDisk = await this.loadFromDiskOnStartup();
        this.functionIndex.merge(dataFromDisk.functionIndex);
        this.globalFunctionNames = await this.dbRepo.getAllFunctionNames();
        this.rebuildCachedFunctionList();
        logger.debug('[Indexer] Cached function list size after rebuild:', this.cachedFunctionList.length);
        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            this.setCurrentFileExtension(getExtensionFromFilePath(fileName));
        }
        this.initialInodeMap = dataFromDisk.inodeModifiedAt;
        return true;
    }

    initWorkers() {
        this.fileWorker = new WorkerManager(FILE_EXTRACT_FILE_PATH, this.functionIndex);
        this.createDiskWorker();
        
        this.bus = new WorkerBus(this.fileWorker.worker, this.fileWorker);
        this.bus.bind();
        this.bus.on(FETCHED_FUNCTIONS, (m) => {
            const p = m.payload || {};
            logger.debug('[Indexer] Received fetchedFunctions for', p.filePath, 'count=', (p.functions||[]).length);
            if (p.filePath && p.functions) {
                this.functionIndex.set(p.filePath, p.functions);
                this.updateCacheHandler(p.filePath);
            }
        });
        this.bus.setInodeModifiedAt(this.initialInodeMap || new Map());
        logger.debug('[Indexer] Trigger initial extractFileNames for workspace');
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

            logger.debug('[Indexer] onDidChangeActiveTextEditor posting extract for file:', filePath);
            this.bus.extractFileNames({ workspacePath: this.workspacePath, source: "onDidOpenfile", filePath, extension }, 'high');
            this.bus.extractFileNames({ workspacePath: this.workspacePath, source: "onDidOpenDir", filePath: getDirPath(filePath), extension }, 'high');
        });
    }

    startSnapshotTimer() {
        const interval =  SNAPSHOT_TO_DISK_INTERVAL;
        this.flushToDBIntervalHandle = setInterval(async () => {
            try {
                this.writeCacheToDB();
                this.functionIndex.clearNewBuffer();
            } catch {}
        }, interval);
    }



    async loadFromDiskOnStartup() {
        let inodeModifiedAt = new Map();
        try {
            const days = Number(process.env.FUNCTION_SEARCH_TIME_WINDOW_DAYS);
            const windowStartMs = Date.now() - (days * MILLISECONDS_PER_DAY);
            const base = getDBDir();
            const data = await this.dbRepo.loadStartupCache(base, windowStartMs);
            inodeModifiedAt = data.inodeModifiedAt;
            this.functionIndex.merge(data.functionIndex);
            logger.debug('[Indexer] Loaded from DB:', {
                inodeCount: inodeModifiedAt.size,
                functionIndexFiles: this.functionIndex.size
            });
        } catch (err) {
            logger.error("Failed to load DB caches:", err);
        }
        return { inodeModifiedAt, functionIndex: this.functionIndex };
    }

    /**
     * Mark file as accessed
     */
    markFileAccessed(filePath) {
        this.lastAccessIndex.set(filePath, Date.now());
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


    createDiskWorker(){
        this.diskWorker = new Worker(DISK_WORKER_FILE_PATH);
    }

    async restartDiskWorker() {
        logger.warn('[Indexer] Restarting DiskWorker');

        try {
            await this.diskWorker.terminate();
        } catch (err) {
            logger.error('[Indexer] Error terminating old DiskWorker', err);
        }

        this.createDiskWorker();
    }

    async diskWorkerhealthcheck() {
        const timeoutMs = 2000;
        const worker = this.diskWorker; // snapshot

        return new Promise((resolve, reject) => {
            // Case 1: worker is null -> wait 2s, then try again
            if (!worker) {
                setTimeout(() => {
                    // after 2s, check again
                    if (!this.diskWorker) {
                        return reject(new Error('DiskWorker is null even after wait'));
                    }
                    // re-run healthcheck on the new worker
                    this.diskWorkerhealthcheck().then(resolve).catch(reject);
                }, timeoutMs);
                return;
            }

            const request_id = Date.now(); // current timestamp as request_id

            const onMessage = (msg) => {
                if (!msg || msg.type !== 'PONG') return;
                if (msg.response_id !== request_id) return; // not our PONG

                clearTimeout(timer);
                worker.off('message', onMessage);
                resolve(msg);
            };

            const timer = setTimeout(async () => {
                worker.off('message', onMessage);

                const restartPromise = this.restartDiskWorker();
                restartPromise.catch((err) => {
                    logger.error('[Indexer] Failed to restart DiskWorker', err);
                });
                await restartPromise;      
                resolve(`New DiskWorker created after timeout (request_id=${request_id})`);
            }, timeoutMs);

            worker.on('message', onMessage);

            try {
                worker.postMessage({ type: 'PING', request_id });
            } catch (err) {
                clearTimeout(timer);
                worker.off('message', onMessage);
                reject(err);
            }
        });
    }


    async diskWorkerPostMessage(payload){
        await this.diskWorkerhealthcheck();
        this.diskWorker.postMessage(payload);
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


    writeCacheToDB() {
        this.diskWorkerPostMessage({ 
            type: WRITE_CACHE_TO_FILE, 
            payload: {
                dbPath: getDBDir(), 
                functionIndex: this.functionIndex.getNewData(), 
                lastAccess: this.lastAccessIndex.getNewData()
            }
        });
    }

    deleteAllCache() {
        this.diskWorkerPostMessage({ type: DELETE_ALL_CACHE, payload: {dbPath: getDBDir()} });
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
        if (this.flushToDBIntervalHandle) {resetInterval(this.flushToDBIntervalHandle);}        
        try { if (this.watcher) {this.watcher.dispose();} } catch {}
        try { 
            this.writeCacheToDB();
        } catch {}
    }
}

module.exports = { IndexerService, prepareFunctionProperties };
