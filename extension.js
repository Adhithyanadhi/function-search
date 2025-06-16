require('./logger'); // Must be at the top

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { ACTIVE_DOC_CHANGE_DEBOUNCE_DELAY, SNAPSHOT_TO_DISK_INTERVAL, supportedExtensions, FILE_PROPERTIES, FILE_EXTRACT_FILE_PATH } = require('./constants');
const { getDirPath, getExtensionFromFilePath, prioritizeCurrentFileExt } = require("./utils/common");
const { InitializeEnvs, getInodeModifiedAtFilePath, getFunctionIndexFilePath } = require("./utils/vscode");
const { showFunctionSearchQuickPick } = require("./quickpick");
const { watchForChanges } = require("./fileWatcher");
const { WorkerManager } = require('./fileWorkerManager');
const { Worker } = require('worker_threads');

let functionIndex = new Map();
let fileWorker;
let currentFileExtension = "";
let cachedFunctionList = [];  // Cache for the quickpick list
let fileToRangeMap = new Map(); // Map<filePath, { start, end }>
let functionIndexDirty = false;
let debounceChangeActiveDoc = null;

function markFunctionIndexDirty() {
    functionIndexDirty = true;
}

function loadFromDiskOnStartup(context, workspacePath) {
    let inodeModifiedAt = new Map();

    let functionIndexFilePath = getFunctionIndexFilePath();
    let inodeModifiedAtFilePath = getInodeModifiedAtFilePath();

    if (fs.existsSync(functionIndexFilePath)) {
        try {
            const raw = fs.readFileSync(functionIndexFilePath, 'utf-8').trim();
            if (raw) {
                functionIndex = new Map(Object.entries(JSON.parse(raw)));
            }
        } catch (err) {
            console.error("Failed to load cached maps:", err);
        }
    }

    if (fs.existsSync(inodeModifiedAtFilePath)) {
        try {
            const raw = fs.readFileSync(inodeModifiedAtFilePath, 'utf-8').trim();
            if (raw) {
                inodeModifiedAt = new Map(Object.entries(JSON.parse(raw)));
            }
        } catch (err) {
            console.error("Failed to load cached maps:", err);
        }
    }

    return { inodeModifiedAt, functionIndex }
}

function prepareFunctionProperties(f, file, iconPath, extension) {
    return {
        label: f.name,
        lowercased_label: f.name.toLowerCase(),
        description: `${f.relativeFilePath}:${f.line}`,
        file: file,
        line: f.line,
        function_name: f.name,
        iconPath: iconPath,
        alwaysShow: true,
        extension: extension
    }
}

function setCurrentFileExtension(ext){
    if(currentFileExtension === ext) return;
    currentFileExtension = ext;
    prioritizeCurrentFileExtHandler(cachedFunctionList, currentFileExtension);
}

function getIconPath(extension) {
    const fileProps = FILE_PROPERTIES[extension];
    return fileProps?.fileIcon ? vscode.Uri.file(fileProps.fileIcon) : undefined;
}


function rebuildFileToRangeMap(){
    fileToRangeMap = new Map();
    let start = 0;
    for (let i = 0; i < cachedFunctionList.length; i++) {
        const file = cachedFunctionList[i].file;
        fileToRangeMap.set(file, { start, end: i + 1 });
    }
}

function prioritizeCurrentFileExtHandler() {
    cachedFunctionList = prioritizeCurrentFileExt(cachedFunctionList, currentFileExtension);
    rebuildFileToRangeMap();
}



function rebuildCachedFunctionList() {
    cachedFunctionList = [];
    fileToRangeMap.clear();

    for (const [file, functions] of functionIndex.entries()) {
        const ext      = getExtensionFromFilePath(file);
        const iconPath = getIconPath(ext);
        const items    = functions.map(f =>
            prepareFunctionProperties(f, file, iconPath, ext)
        );
        cachedFunctionList.push(...items);
    }

    prioritizeCurrentFileExtHandler(cachedFunctionList, currentFileExtension);
}

function updateCache(filePath, newFunctions) {
    const ext = getExtensionFromFilePath(filePath)
    const iconPath = getIconPath(ext)
    const newItems = newFunctions.map(f => prepareFunctionProperties(f, filePath, iconPath, ext));

    const oldRange = fileToRangeMap.get(filePath);
    if (oldRange) {
        cachedFunctionList.splice(oldRange.start, oldRange.end - oldRange.start);
        for (const [file, range] of fileToRangeMap.entries()) {
            if (range.start > oldRange.start) {
                fileToRangeMap.set(file, {
                    start: range.start - (oldRange.end - oldRange.start),
                    end: range.end - (oldRange.end - oldRange.start)
                });
            }
        }
    }

    const newStart = cachedFunctionList.length;
    cachedFunctionList.push(...newItems);
    fileToRangeMap.set(filePath, { start: newStart, end: newStart + newItems.length });
}

function updateCacheHandler(filePath) {
    markFunctionIndexDirty();
    const updatedFunctions = functionIndex.get(filePath) || [];
    updateCache(filePath, updatedFunctions);
    prioritizeCurrentFileExtHandler();
}

function activate(context) {
    console.log("Function Search Extension Activated");

    const workspacePath = vscode.workspace.rootPath;

    if (workspacePath) {
        InitializeEnvs(context, workspacePath);
        const dataFromDisk = loadFromDiskOnStartup();
        functionIndex = dataFromDisk.functionIndex;
        rebuildCachedFunctionList();
        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            setCurrentFileExtension(getExtensionFromFilePath(fileName));
        }

        fileWorker = new WorkerManager(FILE_EXTRACT_FILE_PATH, functionIndex, getFunctionIndexFilePath(), updateCacheHandler);

        fileWorker.postMessage({ type: 'inodemodifiedat', data: dataFromDisk.inodeModifiedAt });
        fileWorker.postMessage({ type: 'extractFileNames', workspacePath, filePath: workspacePath, priority: "low", extension: "__all__", initialLoad: true });
        watchForChanges(workspacePath, functionIndex, fileWorker, updateCacheHandler);
    }

    let disposable = vscode.commands.registerCommand('extension.searchFunction', async () => {
        if (functionIndex.size === 0) {
            vscode.window.showInformationMessage("No functions indexed yet. Please wait...");
            return;
        }

        if (cachedFunctionList.length === 0) {
            console.log("Rebuilding function list...");
            rebuildCachedFunctionList();
        }

        showFunctionSearchQuickPick(cachedFunctionList, currentFileExtension);
    });

    context.subscriptions.push(disposable);

    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) return;
        const document = editor.document;
        const filePath = document.fileName;
        const extension = getExtensionFromFilePath(filePath);
        
        if (!supportedExtensions.includes(extension)) return;

        if (extension !== currentFileExtension) {
            clearTimeout(debounceChangeActiveDoc);

            debounceChangeActiveDoc = setTimeout(() => {
                setCurrentFileExtension(extension);
            }, ACTIVE_DOC_CHANGE_DEBOUNCE_DELAY); 
        }

        fileWorker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenfile", filePath: filePath, priority: "high", extension });
        fileWorker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenDir", filePath: getDirPath(filePath), priority: "high", extension });
    });
}

setInterval(() => {
    if (functionIndexDirty) {
        functionIndexDirty = false;
        fileWorker?.postMessage({ type: "write-inodeModifiedAt-to-file", filePath: getInodeModifiedAtFilePath() });
    }
}, SNAPSHOT_TO_DISK_INTERVAL);


module.exports = { activate };
