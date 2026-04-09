import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'scripts', 'css-deprecations.json');
const SCAN_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, 'tests')];

function walkFiles(dirPath, matcher) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath, matcher));
      continue;
    }
    if (entry.isFile() && matcher(nextPath)) files.push(nextPath);
  }
  return files.sort();
}

function toPosix(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadEntries() {
  const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  return Array.isArray(parsed?.entries)
    ? parsed.entries.filter((entry) => entry?.status === 'deprecated' && typeof entry.className === 'string')
    : [];
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function main() {
  const entries = loadEntries();
  const files = SCAN_DIRS.flatMap((dirPath) => walkFiles(dirPath, (filePath) => /\.(ts|tsx|js|jsx|html)$/.test(filePath)));
  const failures = [];

  for (const entry of entries) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(entry.className)}([^A-Za-z0-9_-]|$)`, 'g');
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const match of content.matchAll(pattern)) {
        const line = lineNumberAt(content, match.index ?? 0);
        failures.push(`${toPosix(filePath)}:${line} still references deprecated class ${entry.className}`);
      }
    }
  }

  console.log(`[check-css-deprecated-usage] entries=${entries.length}, failures=${failures.length}`);
  if (failures.length > 0) {
    console.error('[check-css-deprecated-usage] failed');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log('[check-css-deprecated-usage] OK');
}

main();