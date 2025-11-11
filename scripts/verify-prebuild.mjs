import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function detectElectron() {
  try {
    const out = execFileSync('code', ['--version', '--verbose'], { encoding: 'utf8' });
    const m = out.match(/^Electron:\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return process.env.ELECTRON_VERSION || null;
}
function getAbi(version) {
  const nodeAbi = require(require.resolve('node-abi', { paths: [process.cwd()] }));
  return nodeAbi.getAbi(version, 'electron');
}

const electron = detectElectron();
if (!electron) {
  console.error('verify-prebuild: could not detect Electron. Use ELECTRON_VERSION=xx.x.x npm run verify:prebuild');
  process.exit(1);
}
const abi = getAbi(electron);
const platarch = `${os.platform()}-${os.arch()}`;
const p = path.join(process.cwd(), 'prebuilds', platarch, `electron-v${abi}`, 'better_sqlite3.node');

if (!fs.existsSync(p)) {
  console.error(`Prebuild missing for ${platarch} electron-v${abi}: ${p}`);
  process.exit(1);
}
console.log('Prebuild present:', p);
