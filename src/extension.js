const vscode = require('vscode');
const { bootstrap } = require('./services/core/bootstrap');
const { initializeEnvironment, getDBDir } = require('./utils/vscode');
const { SearchFunctionCommand } = require('./commands/searchFunction');
const { ClearIndexCommand } = require('./commands/clearIndex');
const { WriteToCacheCommand } = require('./commands/writeToCache');
const pkg = require('../package.json');

/**
 * @param {import('vscode').ExtensionContext} context
 */
async function activate(context) {
	console.log(`Function Search Extension Activated (v${pkg.version})`);

	try {
		const isCursor = vscode.env?.appName && vscode.env.appName.toLowerCase().includes('cursor');
		await vscode.commands.executeCommand('setContext', 'functionSearch.isCursor', !!isCursor);
	} catch {}

    let dbReady = false;
    try {
        await initializeEnvironment(context);
        
        // Initialize service architecture
        bootstrap.registerServices();
        await bootstrap.initializeServices();
        
        // Initialize database (RO for main thread)
        const dbRepo = bootstrap.getService('databaseRepository');
        dbRepo.ensureOpen(getDBDir(), true);
        dbReady = true;
        
    } catch (e) {
        console.warn('[Extension] Service/DB initialization failed:', e);
    }

    if (!dbReady) {
        console.error('[Extension] DB not ready; skipping indexerService activation.');
        return;
    }

    // Create indexerService with service container
    const indexerService = bootstrap.getService('indexerService');
	try {
        await indexerService.activate(context);
	} catch (err) {
		console.error('[Extension] IndexerService activation failed:', err);
	}

	// Register commands using service architecture
	const commandManager = bootstrap.getService('commandManager');
	commandManager.registerCommand('searchFunction', SearchFunctionCommand);
	commandManager.registerCommand('clearIndex', ClearIndexCommand);
	commandManager.registerCommand('writeToCache', WriteToCacheCommand);
	commandManager.registerWithVSCode(context);


	const cfgDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('function-name-search.regexes')) {
			if (!indexerService) return;
			const config = vscode.workspace.getConfiguration('function-name-search');
			const userConfig = config.get('regexes') || {};
			indexerService.updateUserRegexConfig(userConfig);
		} else if (e.affectsConfiguration('function-name-search.ignore')) {
			if (!indexerService) return;
			const config = vscode.workspace.getConfiguration('function-name-search');
			const userConfig = config.get('ignore') || {};
			indexerService.updateUserIgnoreConfig(userConfig);
		}
	});


	context.subscriptions.push(cfgDisposable);
	context.subscriptions.push({
		dispose: async () => {
			try {
				await indexerService.dispose();
			} catch {}
			try {
				await bootstrap.dispose();
			} catch {}
		}
	});
}

function deactivate() {}

module.exports = { activate, deactivate };
