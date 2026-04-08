import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const REGISTRY_PATH = path.join(ROOT, 'scripts', 'css-deprecations.json');

function walkFiles(dirPath, matcher) {
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

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  if (!Array.isArray(parsed?.entries)) return [];
  return parsed.entries;
}

function collectClassSet() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  const classSet = new Set();
  const classRe = /\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
  for (const filePath of cssFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = classRe.exec(content))) {
      classSet.add(match[1]);
    }
  }
  return classSet;
}

function main() {
  const entries = loadRegistry();
  const classes = collectClassSet();
  const now = new Date();
  const failures = [];

  for (const item of entries) {
    if (!item || typeof item.className !== 'string') continue;
    if (item.status !== 'deprecated') continue;
    if (typeof item.removeAfter !== 'string') continue;

    const removeAfter = new Date(item.removeAfter);
    if (Number.isNaN(removeAfter.getTime())) {
      failures.push(`invalid removeAfter date for ${item.className}`);
      continue;
    }

    if (removeAfter <= now && classes.has(item.className)) {
      failures.push(`deprecated class expired but still present: ${item.className}`);
    }
  }

  console.log(`[check-css-deprecation-window] entries=${entries.length}, failures=${failures.length}`);
  if (failures.length > 0) {
    console.error('[check-css-deprecation-window] failed');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('[check-css-deprecation-window] OK');
}

main();
