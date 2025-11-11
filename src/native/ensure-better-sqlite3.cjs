// Select & install the correct better_sqlite3.node for (platform, arch, ABI).
const fs = require('fs');
const path = require('path');

function resolvePkgDir(pkgName, fromDir) {
  const pkgJson = require.resolve(`${pkgName}/package.json`, { paths: [fromDir] });
  return path.dirname(pkgJson);
}

function safeLinkOrCopy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    const st = fs.lstatSync(dst);
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(dst);
      const resolved = path.resolve(path.dirname(dst), target);
      if (resolved === src) return;
      fs.unlinkSync(dst);
    } else {
      fs.unlinkSync(dst);
    }
  } catch {}
  try { fs.symlinkSync(src, dst); } catch { fs.copyFileSync(src, dst); }
}

function ensureBetterSqlite3Binary() {
  const { platform, arch, versions } = process;
  const abi = versions.modules;               // e.g. 132
  const runtime = versions.electron ? 'electron' : 'node';

  const pkgDir = resolvePkgDir('better-sqlite3', __dirname);
  const repoRoot = path.resolve(pkgDir, '..', '..'); // node_modules → project root

  const src = path.join(repoRoot, 'prebuilds', `${platform}-${arch}`, `${runtime}-v${abi}`, 'better_sqlite3.node');
  const dst = path.join(pkgDir, 'build', 'Release', 'better_sqlite3.node');

  if (!fs.existsSync(src)) {
    throw new Error(
      `Missing prebuild: ${src}\n` +
      `Run "npm run prebuild:current" or build via CI matrix.`
    );
  }
  safeLinkOrCopy(src, dst);
}

module.exports = { ensureBetterSqlite3Binary };
