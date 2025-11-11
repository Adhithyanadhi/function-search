// scripts/build.js
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.js'],
  outfile: 'out/extension.js',
  bundle: true,
  platform: 'node',
  target: 'node18',              // or the Node your VS Code uses
  format: 'cjs',
  external: ['vscode', 'better-sqlite3'],          // native addon must be external
  sourcemap: true,
  plugins: []
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
