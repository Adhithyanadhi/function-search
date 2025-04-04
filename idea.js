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

const fileIcons = {
    "py": path.join(__dirname, "icons", "py.svg"),
    "rb": path.join(__dirname, "icons", "rb.svg"),
    "go": path.join(__dirname, "icons", "go.svg"),
    "java": path.join(__dirname, "icons", "java.svg"),
    "js": path.join(__dirname, "icons", "js.svg"),
    "ts": path.join(__dirname, "icons", "ts.svg"),
};

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
			const iconPath = fileIcons[extension] ? vscode.Uri.file(fileIcons[extension]) : undefined;
	
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


// import * as vscode from "vscode";
// import fuzzaldrin from "fuzzaldrin-plus";

// export function activate(context: vscode.ExtensionContext) {
//     context.subscriptions.push(
//         vscode.commands.registerCommand("extension.quickPickSubsequence", async () => {
//             const items = [
//                 { label: "apple" },
//                 { label: "application" },
//                 { label: "banana" },
//                 { label: "grape" },
//                 { label: "apricot" },
//                 { label: "pineapple" },
//                 { label: "grapefruit" },
//                 { label: "blackberry" },
//                 { label: "blueberry" }
//             ];

//             const quickPick = vscode.window.createQuickPick();
//             quickPick.items = items;

//             quickPick.onDidChangeValue((searchText) => {
//                 if (!searchText) {
//                     quickPick.items = items;
//                     return;
//                 }

//                 // Use fuzzaldrin to rank matches efficiently
//                 const filteredItems = fuzzaldrin.filter(items, searchText, { key: "label" });

//                 quickPick.items = filteredItems;
//             });

//             quickPick.onDidAccept(() => {
//                 vscode.window.showInformationMessage(`Selected: ${quickPick.selectedItems[0]?.label}`);
//                 quickPick.hide();
//             });

//             quickPick.show();
//         })
//     );
// }




// const { Worker, isMainThread, parentPort } = require('worker_threads');
// const os = require('os');
// const path = require('path');
// const fs = require('fs');

// const MAX_WORKERS = os.cpus().length - 1; // Keep 1 core free
// const BATCH_SIZE = 5; // Adjust based on load
// const TASK_QUEUE = []; // Priority queue for file processing
// const WORKER_POOL = new Set();

// if (isMainThread) {
//     // Function to create a worker
//     function createWorker() {
//         const worker = new Worker(__filename);
//         worker.on('message', () => assignTask(worker)); // When done, assign new task
//         worker.on('exit', () => {
//             WORKER_POOL.delete(worker);
//             if (TASK_QUEUE.length > 0) WORKER_POOL.add(createWorker());
//         });
//         return worker;
//     }

//     // Assign tasks to available workers
//     function assignTask(worker) {
//         if (TASK_QUEUE.length === 0) return;
//         const batch = TASK_QUEUE.splice(0, BATCH_SIZE); // Process in batches
//         worker.postMessage(batch);
//     }

//     // Function to add files to the queue (priority-based sorting by last modified time)
//     function addFilesToQueue(files) {
//         files.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime); // Prioritize recent files
//         TASK_QUEUE.push(...files);
//         for (const worker of WORKER_POOL) assignTask(worker);
//     }

//     // Initialize workers
//     for (let i = 0; i < Math.min(MAX_WORKERS, TASK_QUEUE.length / BATCH_SIZE); i++) {
//         WORKER_POOL.add(createWorker());
//     }

//     // Example: Adding files to the queue
//     const files = fs.readdirSync('./codebase').map(f => path.join('./codebase', f));
//     addFilesToQueue(files);
// } else {
//     parentPort.on('message', (files) => {
//         for (const file of files) {
//             const content = fs.readFileSync(file, 'utf-8');
//             // Simulate function extraction (Replace with AST logic)
//             console.log(`Processed: ${file}`);
//         }
//         parentPort.postMessage('done'); // Notify completion
//     });
// }
