require('./logger'); // Must be at the top

const vscode = require('vscode');
const { supportedExtensions, FILE_PROPERTIES, FILE_EXTRACT_FILE_PATH } = require('./constants');
const { getDirPath } = require("./utils"); 
const { showFunctionSearchQuickPick } = require("./quickpick")
const { watchForChanges } = require("./fileWatcher")
const { getExtentionFromFilePath } = require('./utils')
const {WorkerManager} = require('./fileWorkerManager');

let functionIndex = new Map()
let fileWorker;
let currentFileExtention = ""

let cachedFunctionList = [];  // Cache for the quickpick list
let fileToRangeMap = new Map(); // Map<filePath, { start, end }>

function rebuildFunctionList() {
    cachedFunctionList = [];
    fileToRangeMap.clear();

    const files = Array.from(functionIndex.keys());
    let currentIndex = 0;

    for (const file of files) {
        const functions = functionIndex.get(file) || [];
        const extension = getExtentionFromFilePath(file);
        const fileProps = FILE_PROPERTIES[extension];
        const iconPath = fileProps?.fileIcon ? vscode.Uri.file(fileProps.fileIcon) : undefined;

        const items = functions.map(f => ({
            label: f.name,
            lowercased_label: f.name.toLowerCase(),
            description: `${f.relativeFilePath}:${f.line}`,
            file: file,
            line: f.line,
            function_name: f.name,
            iconPath: iconPath
        }));

        cachedFunctionList.push(...items);
        fileToRangeMap.set(file, { start: currentIndex, end: currentIndex + items.length });
        currentIndex += items.length;
    }
}


// New: Fine-grained update cache for single file
function updateCache(filePath, newFunctions) {
    const extension = getExtentionFromFilePath(filePath);
    const fileProps = FILE_PROPERTIES[extension];
    const iconPath = fileProps?.fileIcon ? vscode.Uri.file(fileProps.fileIcon) : undefined;

    const newItems = newFunctions.map(f => ({
        label: f.name,
        lowercased_label: f.name.toLowerCase(),
        description: `${f.relativeFilePath}:${f.line}`,
        file: filePath,
        line: f.line,
        function_name: f.name,
        iconPath: iconPath,
        alwaysShow: true
    }));

    const oldRange = fileToRangeMap.get(filePath);
    if (oldRange) {
        // Remove old items
        cachedFunctionList.splice(oldRange.start, oldRange.end - oldRange.start);

        // Update ranges of files that came after
        for (const [file, range] of fileToRangeMap.entries()) {
            if (range.start > oldRange.start) {
                fileToRangeMap.set(file, {
                    start: range.start - (oldRange.end - oldRange.start),
                    end: range.end - (oldRange.end - oldRange.start)
                });
            }
        }
    }

    // Insert new items at end (append)
    const newStart = cachedFunctionList.length;
    cachedFunctionList.push(...newItems);
    fileToRangeMap.set(filePath, { start: newStart, end: newStart + newItems.length });
}

function activate(context) {
    console.log("Function Search Extension Activated");

    const workspacePath = vscode.workspace.rootPath;
    fileWorker = new WorkerManager(FILE_EXTRACT_FILE_PATH, functionIndex, updateCacheHandler);

    if (workspacePath) {
        fileWorker.postMessage({ type: 'extractFileNames', workspacePath, filePath: workspacePath, priority: "low", extension: "__all__", initialLoad: true });
        watchForChanges(workspacePath, functionIndex, fileWorker, updateCacheHandler);
    }

    let disposable = vscode.commands.registerCommand('extension.searchFunction', async () => {
        if (functionIndex.size === 0) {
            vscode.window.showInformationMessage("No functions indexed yet. Please wait...");
            return;
        }

        // Only rebuild if cache is empty
        if (cachedFunctionList.length === 0) {
            console.log("Rebuilding function list...");
            rebuildFunctionList();
        }
        
        showFunctionSearchQuickPick(cachedFunctionList);
    });

    context.subscriptions.push(disposable);

    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) return;
        const document = editor.document;
        const filePath = document.fileName;
        const extension = getExtentionFromFilePath(filePath);

        if (supportedExtensions.includes(extension)) {
            currentFileExtention = extension;
        }

        fileWorker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenfile", filePath: filePath, priority: "high", extension });
        fileWorker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenDir", filePath: getDirPath(filePath), priority: "high", extension });
    });

    function updateCacheHandler(filePath) {
        const updatedFunctions = functionIndex.get(filePath) || [];
        updateCache(filePath, updatedFunctions);
    }
}
module.exports = { activate };
