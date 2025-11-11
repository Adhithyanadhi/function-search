const logger = require('../utils/logger');
const { getExtensionFromFilePath } = require('../utils/common')
const { WORKSPACE_RELATIVE_FILE_MATCH_PATTERN, FILE_EDIT_DEBOUNCE_DELAY } = require('../config/constants');
const vscode = require('vscode');
const { getWorkspaceFolder } = require('../utils/vscode');

function watchForChanges(workspacePath, functionIndex, bus, updateCacheHandler) {
    const workspaceFolder = getWorkspaceFolder(workspacePath);
	if (!workspaceFolder) {
		logger.error(`No workspace folder found for path: ${workspacePath}`);
		return;
	}

	const pattern = new vscode.RelativePattern(workspaceFolder, WORKSPACE_RELATIVE_FILE_MATCH_PATTERN);
	const watcher = vscode.workspace.createFileSystemWatcher(pattern);

	const debounceMap = new Map();

	const handleFileChangeEvent = (uri) => {
		const filePath = uri.fsPath;
		logger.debug('[Watcher] file event for', filePath);
		if (debounceMap.has(filePath)) {
			clearTimeout(debounceMap.get(filePath));
		}

		const timer = setTimeout(() => {
			try {
				debounceMap.delete(filePath);

				logger.debug('[Watcher] posting extract for changed file');
				bus.extractFileNames({
					workspacePath,
					source: 'fileWatcher',
					filePath,
					extension: getExtensionFromFilePath(filePath),
				}, 'high');
			} catch (err) {
				logger.error("Error inside setTimeout:", err);
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

	return watcher;
}

module.exports = {watchForChanges};


