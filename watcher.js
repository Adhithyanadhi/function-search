const { getExtentionFromFilePath } = require('./utils')
const { WORKSPACE_RELATIVE_FILE_MATCH_PATTERN, FILE_EDIT_DEBOUNCE_DELAY } = require('./constants');
const debounceMap = new Map();
const { Worker } = require('worker_threads');
const path = require('path');
const vscode = require('vscode');

let    worker = new Worker(path.join(__dirname, './extractFileNameWorker.js'));

function watchForChanges(workspacePath, functionIndex) {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspacePath));
	if (!workspaceFolder) {
		console.error(`No workspace folder found for path: ${workspacePath}`);
		return;
	}

	const pattern = new vscode.RelativePattern(workspaceFolder, WORKSPACE_RELATIVE_FILE_MATCH_PATTERN); // Customize as needed
	const watcher = vscode.workspace.createFileSystemWatcher(pattern);

	const handleFileChangeEvent = (uri) => {
		const filePath = uri.fsPath;
		if (debounceMap.has(filePath)) {
			clearTimeout(debounceMap.get(filePath));
		}

		const timer = setTimeout(() => {
			debounceMap.delete(filePath);
			console.log("file changed", workspacePath, filePath);
			worker.postMessage({ type: 'extractFileNames', workspacePath, source: "fileWatcher", filePath, priority: "high", extension: getExtentionFromFilePath(filePath) });

		}, FILE_EDIT_DEBOUNCE_DELAY);

		debounceMap.set(filePath, timer);
	};

	watcher.onDidChange(handleFileChangeEvent);
	watcher.onDidCreate(handleFileChangeEvent);
	watcher.onDidDelete((uri) => {
		const filePath = uri.fsPath;
		functionIndex[filePath] = []
	});
}


module.exports = {watchForChanges};