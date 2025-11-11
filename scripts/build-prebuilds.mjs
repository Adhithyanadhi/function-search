// scripts/build-prebuilds.mjs
// Builds better-sqlite3 for a given Electron (or Node) target, and
// copies the .node into prebuilds/<platform-arch>/<runtime>-v<abi>/.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PREBUILDS = path.join(ROOT, 'prebuilds');

function run(cmd, args, env = {}) {
	return execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, cwd: ROOT });
}

function requireNodeAbi() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const modPath = require.resolve('node-abi', { paths: [ROOT] });
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	return require(modPath);
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function copyBuiltBinaryToPrebuilds({ runtime, abi, platform, arch }) {
	const src = path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
	if (!fs.existsSync(src)) throw new Error(`Build did not produce: ${src}`);
	const dstDir = path.join(PREBUILDS, `${platform}-${arch}`, `${runtime}-v${abi}`);
	ensureDir(dstDir);
	fs.copyFileSync(src, path.join(dstDir, 'better_sqlite3.node'));
	console.log(`✔ wrote ${path.join(dstDir, 'better_sqlite3.node')}`);
}

function cleanBuiltBinary() {
	const bin = path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
	try { fs.unlinkSync(bin); } catch {}
}

function rebuildFor({ runtime, target }) {
	if (runtime === 'electron') {
		run(process.execPath, [
			path.join(ROOT, 'node_modules', '.bin', 'electron-rebuild'),
			'-v', target, '-f', '-w', 'better-sqlite3'
		]);
	} else if (runtime === 'node') {
		// Build against specific Node version (requires headers/toolchain locally)
		run('npm', ['rebuild', 'better-sqlite3', '--build-from-source'], {
			npm_config_target: target,
			npm_config_runtime: 'node'
		});
	} else {
		throw new Error(`Unknown runtime: ${runtime}`);
	}
}

function main() {
	const runtime = process.argv[2] || 'electron';        // 'electron' | 'node'
	const target  = process.argv[3];                      // e.g. '32.2.5' (Electron) or '20.17.0' (Node)
	if (!target) {
		console.error('Usage: node scripts/build-prebuilds.mjs <electron|node> <version>');
		process.exit(1);
	}

	const nodeAbi = requireNodeAbi();
	const abi = nodeAbi.getAbi(target, runtime);          // e.g., 132

	const platform = os.platform();                       // current host
	const arch = os.arch();

	cleanBuiltBinary();
	rebuildFor({ runtime, target });
	copyBuiltBinaryToPrebuilds({ runtime, abi, platform, arch });
}

main();


