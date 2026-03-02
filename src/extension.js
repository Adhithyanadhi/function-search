const vscode = require('vscode');
const { bootstrap } = require('./services/core/bootstrap');
const { initializeEnvironment, getDBDir, deleteOlderCacheFilesInDbDir } = require('./utils/vscode');
const { SearchFunctionCommand } = require('./commands/searchFunction');
const { ClearIndexCommand } = require('./commands/clearIndex');
const { WriteToCacheCommand } = require('./commands/writeToCache');
const { deepEqual } = require('./utils/common');
const pkg = require('../package.json');

function getChangedRegexExtensions(currentRegexes, nextRegexes) {
	const current = currentRegexes;
	const next = nextRegexes;
	const changed = [];
	const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
	for (const ext of keys) {
		const currentPatterns = current[ext] ?? [];
		const nextPatterns = next[ext] ?? [];
		if (!deepEqual(currentPatterns, nextPatterns)) {
			changed.push(ext);
		}
	}
	return changed;
}

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
    let dbRepo = null;
	let indexerService = null;
    try {
        await initializeEnvironment(context);
        
        // Initialize service architecture
        bootstrap.registerServices();
        await bootstrap.initializeServices();
        
        // Initialize database in disk worker (RW) before opening RO in main thread.
        dbRepo = bootstrap.getService('databaseRepository');
		indexerService = bootstrap.getService('indexerService');
		const dbDir = getDBDir();
		if (!dbDir) {
			console.warn('[Extension] No workspace; skipping DB initialization.');
			return;
		}
		void deleteOlderCacheFilesInDbDir();
		await indexerService.ensureDiskWorkerDbReady(dbDir);
        dbRepo.ensureOpen(dbDir, true);
        dbReady = true;
        
    } catch (e) {
        console.warn('[Extension] Service/DB initialization failed:', e);
    }

    if (!dbReady) {
        console.error('[Extension] DB not ready; skipping indexerService activation.');
        return;
    }

	let currentUserConfig = { regexes: {}, ignore: [] };
	const applyUserConfigChange = (nextConfig) => {
		const regexChanged = !deepEqual(currentUserConfig.regexes, nextConfig.regexes);
		const ignoreChanged = !deepEqual(currentUserConfig.ignore, nextConfig.ignore);
		const changedRegexExtensions = regexChanged
			? getChangedRegexExtensions(currentUserConfig.regexes, nextConfig.regexes)
			: [];
		if (!regexChanged && !ignoreChanged) {
			return;
		}

		const diff = {};
		if (regexChanged) { diff.regexes = nextConfig.regexes; }
		if (ignoreChanged) { diff.ignore = nextConfig.ignore; }
		indexerService.writeUserConfigToDB(diff);

		if (regexChanged) {
			indexerService.updateUserRegexConfig(nextConfig.regexes, changedRegexExtensions);
			currentUserConfig.regexes = nextConfig.regexes;
		}
		if (ignoreChanged) {
			indexerService.updateUserIgnoreConfig(nextConfig.ignore, true);
			currentUserConfig.ignore = nextConfig.ignore;
		}
	};

	try {
		const storedRawConfig = await dbRepo.getUserConfig();
		const storedConfig = {
			regexes: storedRawConfig?.regexes ?? {},
			ignore: storedRawConfig?.ignore ?? []
		};
		const config = vscode.workspace.getConfiguration('function-name-search');
		const settingsConfig = {
			regexes: config.get('regexes'),
			ignore: config.get('ignore')
		};
		settingsConfig.regexes = settingsConfig.regexes ?? {};
		settingsConfig.ignore = settingsConfig.ignore ?? [];

        await indexerService.activate(context, settingsConfig);
		currentUserConfig = settingsConfig;
		const regexChanged = !deepEqual(storedConfig.regexes, settingsConfig.regexes);
		const ignoreChanged = !deepEqual(storedConfig.ignore, settingsConfig.ignore);
		if (regexChanged || ignoreChanged) {
			const diff = {};
			if (regexChanged) diff.regexes = settingsConfig.regexes;
			if (ignoreChanged) diff.ignore = settingsConfig.ignore;
			indexerService.writeUserConfigToDB(diff);
		}
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
		if (!indexerService) { return; }
		if (!e.affectsConfiguration('function-name-search.regexes') && !e.affectsConfiguration('function-name-search.ignore')) {
			return;
		}

		const config = vscode.workspace.getConfiguration('function-name-search');
		const nextConfig = {
			regexes: config.get('regexes'),
			ignore: config.get('ignore')
		};
		nextConfig.regexes = nextConfig.regexes ?? {};
		nextConfig.ignore = nextConfig.ignore ?? [];
		applyUserConfigChange(nextConfig);
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
