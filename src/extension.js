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
        console.error('[Extension] DB not ready; skipping indexer activation.');
        return;
    }

    // Create indexer with service container
    const indexer = bootstrap.getService('indexerService');
	try {
        await indexer.activate(context);
	} catch (err) {
		console.error('[Extension] Indexer activation failed:', err);
	}

	// Register commands using service architecture
	const commandManager = bootstrap.getService('commandManager');
	commandManager.registerCommand('searchFunction', SearchFunctionCommand);
	commandManager.registerCommand('clearIndex', ClearIndexCommand);
	commandManager.registerCommand('writeToCache', WriteToCacheCommand);
	commandManager.registerWithVSCode(context);

	context.subscriptions.push({
		dispose: async () => {
			try {
				await indexer.dispose();
			} catch {}
			try {
				await bootstrap.dispose();
			} catch {}
		}
	});
}

function deactivate() {}

module.exports = { activate, deactivate };
