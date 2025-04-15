const { getExtentionFromFilePath } = require('./helper')

const vscode = require('vscode');
const { Worker } = require('worker_threads');
const path = require('path');
const { supportedExtensions, FILE_PROPERTIES } = require('./src/constants');

let functionIndex = {}; // Store indexed functions grouped by file
let worker; // Define worker in global scope
let currentFileExtention = ""
function get_dir_path(file_path){
	return file_path.substring(0, file_path.lastIndexOf("/"));
}

function writeCacheToDisk() {
    try {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(functionCache, null, 2), 'utf-8');
        console.log('[Cache] Function cache saved.');
    } catch (err) {
        console.error('[Cache] Failed to write function cache:', err);

    }
}


// const indexFile = path.join(__dirname, 'index.jsonl');
// const fileIndex = new Map();

// function compactIndexIfNeeded() {
//     const stats = fs.statSync(indexFile);
//     if (stats.size > 5 * 1024 * 1024) {
//         const lines = Array.from(fileIndex.values()).map(v => JSON.stringify(v));
//         fs.writeFileSync(indexFile, lines.join('\n') + '\n');
//     }
// }

// function updateFileEntry(file, modifiedAt, functions) {
//     const record = { file, modifiedAt, functions };
//     fileIndex.set(file, record);
//     fs.appendFileSync(indexFile, JSON.stringify(record) + '\n');
// }


// function loadIndex() {
//   if (!fs.existsSync(indexFile)) return;
//   const lines = fs.readFileSync(indexFile, 'utf-8').split('\n');
//   for (const line of lines) {
//     if (!line.trim()) continue;
//     const data = JSON.parse(line);
//     fileIndex.set(data.file, data);
//   }
// }


// const os = require('os');

// function getDynamicSleepDuration() {
//     const load = os.loadavg()[0]; // 1-minute average
//     const cores = os.cpus().length;
//     const loadRatio = load / cores;
//     console.log(load, cores, loadRatio)
//     // Tune these ranges as needed
//     if (loadRatio < 0.5) return 0;     // Low pressure, no need to sleep
//     if (loadRatio < 0.75) return 5;    // Light load, gentle throttle
//     if (loadRatio < 1.0) return 10;    // Near full, moderate throttle
//     if (loadRatio < 1.5) return 20;    // Overloaded, slow down more
//     return 50;                         // Heavily overloaded
// }

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
	
		}
		const allFunctions = matchingExtentionFunctions.concat(otherExtentionFunctions)
		const selectedFunction = await vscode.window.showQuickPick(allFunctions, { placeHolder: "Search a function by name" });

		if (selectedFunction) {
			openFileAtLine(selectedFunction.file, parseInt(selectedFunction.line, 10));
		}
	});

	context.subscriptions.push(disposable);

	// Watch for opened files and process them first
}




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


// Simple Trie Node
class TrieNode {
	constructor() {
	  this.children = new Map();
	  this.wordIndices = new Set(); // store indices of words that pass through this node
	}
  }
  
  // Main Trie Structure
  class SearchTrie {
	constructor() {
	  this.root = new TrieNode();
	  this.words = []; // original words
	  this.lcWords = []; // lowercased version for case-insensitive match
	}
  
	// Add word to trie and keep track of it
	indexWord(word) {
	  const wordIndex = this.words.length;
	  const lcWord = word.toLowerCase();
  
	  this.words.push(word);
	  this.lcWords.push(lcWord);
  
	  // Insert each character as a subsequence possibility
	  for (let i = 0; i < lcWord.length; i++) {
		let node = this.root;
		for (let j = i; j < lcWord.length; j++) {
		  const char = lcWord[j];
		  if (!node.children.has(char)) {
			node.children.set(char, new TrieNode());
		  }
		  node = node.children.get(char);
		  node.wordIndices.add(wordIndex);
		}
	  }
	}
  
	// Helper function: check if target is a subsequence of word
	isSubsequence(target, word) {
	  let i = 0;
	  for (let j = 0; j < word.length && i < target.length; j++) {
		if (word[j] === target[i]) i++;
	  }
	  return i === target.length;
	}
  
	// Search for all matching words (subsequence match)
	searchTrie(target) {
	  const lcTarget = target.toLowerCase();
	  let node = this.root;
	  for (const char of lcTarget) {
		if (!node.children.has(char)) return [];
		node = node.children.get(char);
	  }
  
	  const results = [];
	  for (const wordIndex of node.wordIndices) {
		if (this.isSubsequence(lcTarget, this.lcWords[wordIndex])) {
		  results.push(this.words[wordIndex]);
		}
	  }
	  return results;
	}
  }
  
  // Export for use
  module.exports = SearchTrie;
  
  /* Example Usage:
  const SearchTrie = require('./trie');
  const trie = new SearchTrie();
  
  ['main', 'map', 'maximize', 'function', 'myFunction'].forEach(word => trie.indexWord(word));
  
  console.log(trie.searchTrie('mn'));  // ['main', 'myFunction']
  */
  