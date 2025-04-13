const { getExtentionFromFilePath } = require('./helper')
const vscode = require('vscode');
const { Worker } = require('worker_threads');
const path = require('path');
const { WORKSPACE_RELATIVE_FILE_MATCH_PATTERN, FILE_EDIT_DEBOUNCE_DELAY, supportedExtensions, FILE_PROPERTIES } = require('./constants');
const debounceMap = new Map();

let functionIndex = {}; // Store indexed functions grouped by file
let worker; // Define worker in global scope
let currentFileExtention = ""

function get_dir_path(file_path){
	return file_path.substring(0, file_path.lastIndexOf("/"));
}

function watchForChanges(workspacePath) {
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
			worker.postMessage({ type: 'extractFileNames', workspacePath, source: "fileWatcher", filePath, priority: "high" , extension:  getExtentionFromFilePath(filePath)});

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

function activate(context) {
	console.log("Function Search Extension Activated");

	const workspacePath = vscode.workspace.rootPath;
	worker = new Worker(path.join( __dirname, './extractFileNameWorker.js'));

	if (workspacePath) {
		worker.postMessage({ type: 'extractFileNames', workspacePath, filePath: workspacePath, priority: "low", extension: "__all__"});
		startWorkerThread(workspacePath);
	}

	let disposable = vscode.commands.registerCommand('extension.searchFunction', async () => {
		if (Object.keys(functionIndex).length === 0) {
			vscode.window.showInformationMessage("No functions indexed yet. Please wait...");
			return;
		}

		let matchingExtentionFunctions = []
		let otherExtentionFunctions = []

		for (const [file, functions] of Object.entries(functionIndex)) {
			const extension = getExtentionFromFilePath(file);  
			const iconPath = FILE_PROPERTIES[extension].fileIcon ? vscode.Uri.file(FILE_PROPERTIES[extension].fileIcon) : undefined;
	
			functions.forEach(f => {
				const item = {
					label: f.name,
					description: `${f.relativeFilePath}:${f.line}`,
					file: file,
					line: f.line,
					function_name: f.name,
					iconPath: iconPath // Attach custom icon
				};
				if (extension == currentFileExtention) {
					matchingExtentionFunctions.push(item);
				} else {
					otherExtentionFunctions.push(item);
				}
			});
		}
		const allFunctions = matchingExtentionFunctions.concat(otherExtentionFunctions)
		const selectedFunction = await vscode.window.showQuickPick(allFunctions, { placeHolder: "Search a function by name" });

		if (selectedFunction) {
			openFileAtLine(selectedFunction.file, parseInt(selectedFunction.line, 10));
		}
	});

	context.subscriptions.push(disposable);

	// Watch for opened files and process them first
	vscode.workspace.onDidOpenTextDocument((document) => {
		const filePath = document.fileName;
		const extension = getExtentionFromFilePath(filePath);
		if (supportedExtensions.includes(extension)) {
			currentFileExtention = extension
			worker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenfile", filePath: filePath, priority: "high" , extension});
			worker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenDir", filePath: get_dir_path(filePath), priority: "high", extension});
		}
		watchForChanges(workspacePath);
	});
}

// Now `worker` is accessible globally
function startWorkerThread() {
	worker.on('message', (data) => {
		if (data.type === 'fetchedFunctions' ) {
			if (data.filePath == undefined || data.functions == undefined){
				console.log("data is empty", data);
			} else {
				functionIndex[data.filePath] = data.functions;
			}
		}
	});

	worker.on('error', (err) => console.error("Worker Error:", err));

	worker.on('exit', (code) => {
		if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
	});
}


function openFileAtLine(filePath, lineNumber) {
	vscode.workspace.openTextDocument(filePath).then(doc => {
		vscode.window.showTextDocument(doc).then(editor => {
			const position = new vscode.Position(lineNumber - 1, 0);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position));
		});
	});
}

module.exports = { activate };
