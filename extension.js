const vscode = require('vscode');
const { Worker } = require('worker_threads');
const path = require('path');
const { supportedExtensions, FILE_PROPERTIES } = require('./constants');
const { getDirPath } = require("./utils"); // Make sure this exists
const { showFunctionSearchQuickPick } = require("./quickpick")
const { watchForChanges } = require("./watcher")
const { getExtentionFromFilePath } = require('./utils')


let functionIndex = new Map()
let worker;
let currentFileExtention = ""

function activate(context) {
	console.log("Function Search Extension Activated");

	const workspacePath = vscode.workspace.rootPath;
	worker = new Worker(path.join(__dirname, './extractFileNameWorker.js'));

	if (workspacePath) {
		worker.postMessage({ type: 'extractFileNames', workspacePath, filePath: workspacePath, priority: "low", extension: "__all__" });
		startWorkerThread(workspacePath);
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

	// Watch for opened files and process them first
	vscode.workspace.onDidOpenTextDocument((document) => {
		const filePath = document.fileName;
		const extension = getExtentionFromFilePath(filePath);
		if (supportedExtensions.includes(extension)) {
			currentFileExtention = extension
			worker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenfile", filePath: filePath, priority: "high", extension });
			worker.postMessage({ type: 'extractFileNames', workspacePath, source: "onDidOpenDir", filePath: getDirPath(filePath), priority: "high", extension });
		}
		watchForChanges(workspacePath);
	});
}

// Now `worker` is accessible globally
function startWorkerThread() {
	worker.on('message', (data) => {
		if (data.type === 'fetchedFunctions') {
			if (data.filePath == undefined || data.functions == undefined) {
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

module.exports = { activate };
