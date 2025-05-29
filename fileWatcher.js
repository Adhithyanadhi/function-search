require('./logger'); // Must be at the top

const { getExtensionFromFilePath } = require('./utils/common')
const { WORKSPACE_RELATIVE_FILE_MATCH_PATTERN, FILE_EDIT_DEBOUNCE_DELAY } = require('./constants');
const debounceMap = new Map();
const vscode = require('vscode');

function watchForChanges(workspacePath, functionIndex, worker, updateCacheHandler) {
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
			try {
				debounceMap.delete(filePath);

				worker.postMessage({
					type: 'extractFileNames',
					workspacePath,
					source: 'fileWatcher',
					filePath,
					priority: 'high',
					extension: getExtensionFromFilePath(filePath),
				});
			} catch (err) {
				console.error("Error inside setTimeout:", err);
			}
		}, FILE_EDIT_DEBOUNCE_DELAY);

		debounceMap.set(filePath, timer);
	};

	watcher.onDidChange(handleFileChangeEvent);
	watcher.onDidCreate(handleFileChangeEvent);
	watcher.onDidDelete((uri) => {
		const filePath = uri.fsPath;
		if (functionIndex.get(filePath)) {
			functionIndex.set(filePath, []);
			updateCacheHandler(filePath);
		}
	});
}


module.exports = {watchForChanges};