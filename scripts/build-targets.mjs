import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const targets = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'prebuild.targets.json'), 'utf8'));
for (const [name, t] of Object.entries(targets)) {
	console.log(`\n=== Building ${name} (${t.runtime}@${t.version}) for this host ===`);
	execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-prebuilds.mjs'), t.runtime, t.version], { stdio: 'inherit' });
}


