import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'css-important-whitelist.json');

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

function toPosix(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function normalize(line) {
  return line.trim().replace(/\s+/g, ' ');
}

function loadConfig() {
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return Array.isArray(parsed?.allowed) ? parsed.allowed : [];
}

function main() {
  const allowedEntries = loadConfig();
  const allowed = new Map();
  const seen = new Set();

  for (const entry of allowedEntries) {
    if (!entry || typeof entry.file !== 'string' || typeof entry.snippet !== 'string') continue;
    const key = `${entry.file}::${normalize(entry.snippet)}`;
    allowed.set(key, entry.reason ?? '');
  }

  const failures = [];
  const cssFiles = walkFiles(STYLES_DIR, (filePath) => filePath.endsWith('.css'));
  let total = 0;

  for (const filePath of cssFiles) {
    const relPath = toPosix(filePath);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const normalized = normalize(lines[index]);
      if (!normalized.includes('!important')) continue;
      total += 1;
      const key = `${relPath}::${normalized}`;
      if (!allowed.has(key)) {
        failures.push(`${relPath}:${index + 1} is not in whitelist -> ${normalized}`);
        continue;
      }
      seen.add(key);
    }
  }

  for (const key of allowed.keys()) {
    if (!seen.has(key)) {
      failures.push(`stale whitelist entry: ${key}`);
    }
  }

  console.log(`[check-css-important-whitelist] occurrences=${total}, allowed=${allowed.size}, failures=${failures.length}`);
  if (failures.length > 0) {
    console.error('[check-css-important-whitelist] failed');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log('[check-css-important-whitelist] OK');
}

main();