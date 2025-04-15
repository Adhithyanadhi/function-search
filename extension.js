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

function activate(context) {
	console.log("Func tion Search Extension Activated");

	const workspacePath = vscode.workspace.rootPath;
	fileWorker = new WorkerManager(FILE_EXTRACT_FILE_PATH, functionIndex);

	if (workspacePath) {
		fileWorker.postMessage({ type: 'extractFileNames', workspacePath, filePath: workspacePath, priority: "low", extension: "__all__", initialLoad: true });
		watchForChanges(workspacePath, functionIndex, fileWorker);
	}

	let disposable = vscode.commands.registerCommand('extension.searchFunction', async () => {
		if (Object.keys(functionIndex).length === 0) {
			vscode.window.showInformationMessage("No functions indexed yet. Please wait...");
			return;
		}

		let matchingExtentionFunctions = []
		let otherExtentionFunctions = []

		// this can be optimized, the list of functions need not be created everytime on ctrl+k and it looks heavy
		for (const [file, functions] of Object.entries(functionIndex)) {
			const extension = getExtentionFromFilePath(file);
			const iconPath = FILE_PROPERTIES[extension].fileIcon ? vscode.Uri.file(FILE_PROPERTIES[extension].fileIcon) : undefined;

			functions.forEach(f => {
				const item = {
					label: f.name,
					lowercased_label: f.name.toLowerCase(),
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


		showFunctionSearchQuickPick(matchingExtentionFunctions.concat(otherExtentionFunctions))
	});

	context.subscriptions.push(disposable);

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (!editor) return;
		const document = editor.document;
		const filePath = document.fileName;
		const extension = getExtentionFromFilePath(filePath);

		if (supportedExtensions.includes(extension)) {
			currentFileExtention = extension
		}
					
		fileWorker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenfile", filePath: filePath, priority: "high", extension });
		fileWorker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenDir", filePath: getDirPath(filePath), priority: "high", extension });
	});
}


module.exports = { activate };
