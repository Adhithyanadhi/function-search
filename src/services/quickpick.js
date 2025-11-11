require('../utils/logger');
const vscode = require('vscode');
const { isSubsequence, prioritizeCurrentFileExt } = require("../utils/common")
const { SEARCH_TIMER_TIMEOUT } = require("../config/constants")

function openFileAtLine(filePath, lineNumber) {
	const uri = vscode.Uri.file(filePath);
	vscode.window.showTextDocument(uri, { preview: false }).then(editor => {
		const position = new vscode.Position(lineNumber, 0);
		editor.selection = new vscode.Selection(position, position);
		editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
	});
}

class QuickPickService {
    static showFunctionSearchQuickPick(allFunctions, currentFileExtension, fallbackProvider, onFileSelected) {
    	const quickPick = vscode.window.createQuickPick();
    	quickPick.placeholder = "Search a function by name";
    	quickPick.matchOnDescription = false;
    	quickPick.matchOnDetail = false;
    	quickPick.sortByLabel = false;

    	let previousSearchText = "";
    	let timeout;
    	let filteredFunctions = allFunctions;

    	function populateQuickShow() {
    		quickPick.items = prioritizeCurrentFileExt(filteredFunctions.slice(0, 100), currentFileExtension);
    	}

    	populateQuickShow();

    	quickPick.onDidChangeValue((searchText) => {
    		const lcSearchText = searchText.toLowerCase();
    		if (!lcSearchText) {
    			filteredFunctions = allFunctions;
    			previousSearchText = lcSearchText;
    			populateQuickShow();
    		} else {
    			if (timeout) {clearTimeout(timeout);}
    			timeout = setTimeout(async () => {
    				if (lcSearchText.length < previousSearchText.length) {
    					filteredFunctions = allFunctions.filter(item => isSubsequence(lcSearchText, item.lowercased_label));
    				} else {
    					filteredFunctions = filteredFunctions.filter(item => isSubsequence(lcSearchText, item.lowercased_label));
    				}
    				if (filteredFunctions.length === 0 && fallbackProvider) {
    					try {
    						const fb = await fallbackProvider(lcSearchText);
    						if (Array.isArray(fb) && fb.length > 0) {
    							filteredFunctions = fb;
    							allFunctions = [...filteredFunctions, ...allFunctions];
    						}
    					} catch {}
    				}
    				populateQuickShow();
    				previousSearchText = lcSearchText;
    			}, SEARCH_TIMER_TIMEOUT);
    		}
    	});

    	quickPick.onDidAccept(() => {
    		const selected = quickPick.selectedItems[0];
    		if (selected?.file != null && selected?.line != null) {
    			openFileAtLine(selected.file, parseInt(selected.line-1, 10));
    			onFileSelected(selected.file);
    		}
    		quickPick.hide();
    	});

    	quickPick.show();
    }
}

module.exports = { QuickPickService };


