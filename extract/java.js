// ───────────────────────────────────────────────────────────────────────────
//  Optimised extractJavaFunctions • returns an array of { name, file, line, relativeFilePath }
// ───────────────────────────────────────────────────────────────────────────
const fs = require('fs');

const MODS = new Set([
  'public', 'protected', 'private', 'static', 'final', 'abstract', 'synchronized',
  'native', 'strictfp', 'default', 'transient'
]);

/** Build an array whose i-th entry is the char-offset where line i starts */
function buildLineOffsets(src) {
  const offs = [0];
  for (let i = 0; i < src.length; ++i) {
    if (src[i] === '\n') offs.push(i + 1);
  }
  return offs;
}

/** Binary search: largest index ≤ val (-1 if none) */
function lastLE(arr, val) {
  let lo = 0, hi = arr.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= val) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}

function extractJavaFunctions(filePath, relativeFilePath, regex) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');               // O(n) once
  const lineOffsets = buildLineOffsets(src);   // O(n)

  const ifacePos = Array.from(src.matchAll(/@interface\b/g), m => m.index);

  const functionList = [];

  for (const m of src.matchAll(regex)) {
    const block = m[0];
    const name = m[1];

    // ————————————————— filters —————————————————
    if (name === 'self' || name === 'build') continue;

    if (/\(\s*\)\s*(?:;|default\b)/.test(block) &&
      lastLE(ifacePos, m.index) !== -1) continue;

    if (/\bnew\s+[A-Za-z_$][\w$]*\s*\(/.test(block) ||
      block.includes(`${name}.class`)) continue;

    const prefix = block.slice(0, block.indexOf(name)).trimEnd();
    const tokens = prefix.split(/\s+/)
      .filter(t => t && !t.startsWith('@') && t !== '=');
    const prev = tokens.pop() || '';

    if (MODS.has(prev) || prev === name || prev === '' ||
      /^(new|else|if|record)$/.test(prev) || /[.,]$/.test(prev) ||
      (prev.endsWith(',') && !prev.includes('<'))) continue;
    // ————————————————— end filters ————————————————

    // 0-based line number → 1-based for humans
    let ln = lastLE(lineOffsets, m.index);
    while (lines[ln] && lines[ln].trim().startsWith('@')) ln--;

    functionList.push({
      name,
      file: filePath,
      line: ln + 1,
      relativeFilePath
    });
  }

  return functionList;
}

module.exports = {extractJavaFunctions};

