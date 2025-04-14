const vscode = require('vscode');
const {isSubsequence} = require("./utils")
const {SEARCH_TIMER_TIMEOUT} = require("./constants")

function openFileAtLine(filePath, lineNumber) {
	vscode.workspace.openTextDocument(filePath).then(doc => {
		vscode.window.showTextDocument(doc).then(editor => {
			const position = new vscode.Position(lineNumber - 1, 0);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position));
		});
	});
}

function showFunctionSearchQuickPick(allFunctions) {
	const quickPick = vscode.window.createQuickPick();
	quickPick.placeholder = "Search a function by name";
	quickPick.items = allFunctions;

	let previousSearchText = "";
	let timeout;

	quickPick.onDidChangeValue((searchText) => {
		if (timeout) clearTimeout(timeout);
		const lcSearchText = searchText.toLowerCase();

		if (lcSearchText.length < previousSearchText.length) {
			quickPick.items = allFunctions;
		} else {
			timeout = setTimeout(() => {
				if (lcSearchText) {
					quickPick.items = quickPick.items.filter(item =>
						isSubsequence(lcSearchText, item.lowercased_label)
					);
				}
			}, SEARCH_TIMER_TIMEOUT);
		}
		previousSearchText = lcSearchText;
	});

	quickPick.onDidAccept(() => {
		const selected = quickPick.selectedItems[0];
		if (selected?.file && selected?.line) {
			openFileAtLine(selected.file, parseInt(selected.line, 10));
		}
		quickPick.hide();
	});

	quickPick.show();
}

module.exports = {showFunctionSearchQuickPick}