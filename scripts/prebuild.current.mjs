import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

function detectElectronVersion() {
  const tryCli = (cmd) => {
    try {
      const out = execFileSync(cmd, ['--version', '--verbose'], { encoding: 'utf8' });
      const m = out.match(/^Electron:\s*(.+)$/m);
      return m && m[1].trim();
    } catch { return null; }
  };
  return process.env.ELECTRON_VERSION || tryCli('code') || tryCli('cursor') || null;
}

function getAbi(runtime, version) {
  const nodeAbi = require(require.resolve('node-abi', { paths: [ROOT] }));
  return nodeAbi.getAbi(version, runtime);
}

function run(cmd, args, env={}) {
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
}

(function main() {
  const electron = detectElectronVersion();
  if (!electron) {
    console.error('Could not detect Electron version. Use ELECTRON_VERSION=xx.x.x npm run prebuild:current');
    process.exit(1);
  }
  const abi = getAbi('electron', electron);
  const platform = os.platform();
  const arch = os.arch();

  // Rebuild better-sqlite3 for this host Electron
  run(process.execPath, [path.join(ROOT, 'node_modules', '.bin', 'electron-rebuild'), '-v', electron, '-f', '-w', 'better-sqlite3']);

  // Copy .node into prebuilds/<platform-arch>/electron-v<abi>/
  const src = path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const dstDir = path.join(ROOT, 'prebuilds', `${platform}-${arch}`, `electron-v${abi}`);
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, path.join(dstDir, 'better_sqlite3.node'));
  console.log(`✔ prebuild ready: ${path.join(dstDir, 'better_sqlite3.node')}`);
})();
