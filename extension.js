const { getExtentionFromFilePath } = require('./helper')

const vscode = require('vscode');
const { Worker } = require('worker_threads');
const path = require('path');
const { supportedExtensions } = require('./constants');

let functionIndex = {}; // Store indexed functions grouped by file
let worker; // Define worker in global scope
let currentFileExtention = ""
function get_dir_path(file_path){
	return file_path.substring(0, file_path.lastIndexOf("/"));
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

		const fileIcons = {
			"py": "$(file-code) ",        // Generic code icon (Python lacks a built-in icon)
			"rb": "$(ruby) ",             // Ruby-specific icon
			"go": "$(symbol-struct) ",    // Go functions often belong to structs
			"java": "$(symbol-class) ",   // Java methods belong to classes
			"js": "$(symbol-function) ",  // JavaScript functions
			"ts": "$(symbol-interface) ", // TypeScript functions, often in interfaces
		};
		

		let matchingExtentionFunctions = []
		let otherExtentionFunctions = []

		for (const [file, functions] of Object.entries(functionIndex)) {
			const extension = getExtentionFromFilePath(file);  // Get the file extension
			const icon = fileIcons[extension] || "$(file-code) "; // Default to code icon if no match
			if(extension == currentFileExtention){
				functions.forEach(f => {
					matchingExtentionFunctions.push({
						label: `${icon}${f.name}`, // Add icon before function name
						description: `${f.relativeFilePath}:${f.line}`,
						file: file,
						line: f.line,
						function_name: `${f.name}`, // Add icon before function name
					});
				});	
			} else {
				functions.forEach(f => {
					otherExtentionFunctions.push({
						label: `${icon}${f.name}`, // Add icon before function name
						description: `${f.relativeFilePath}:${f.line}`,
						file: file,
						line: f.line,
						function_name: `${f.name}`, // Add icon before function name
					});
				});	
			}
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
		console.log("extension", extension)
		if (supportedExtensions.includes(extension)) {
			currentFileExtention = extension
			worker.postMessage({ type: 'extractFileNames', workspacePath, filePath: filePath, priority: "high" , extension});
			worker.postMessage({ type: 'extractFileNames', workspacePath, filePath: get_dir_path(filePath), priority: "high", extension});
		}
	});
}

// Now `worker` is accessible globally
function startWorkerThread(workspacePath) {

	worker.on('message', (data) => {
		if (data.type === 'update' ) {
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
