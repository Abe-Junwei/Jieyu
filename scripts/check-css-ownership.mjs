import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'css-ownership-config.json');

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

function loadConfig() {
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return Array.isArray(parsed?.entries) ? parsed.entries : [];
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function main() {
  const entries = loadConfig();
  const cssFiles = walkFiles(STYLES_DIR, (filePath) => filePath.endsWith('.css'));
  const failures = [];

  for (const entry of entries) {
    if (!entry || typeof entry.ownerFile !== 'string' || !Array.isArray(entry.patterns)) continue;
    const ownerFile = entry.ownerFile;
    const patterns = entry.patterns
      .filter((pattern) => typeof pattern === 'string' && pattern.length > 0)
      .map((pattern) => new RegExp(pattern, 'gm'));

    for (const filePath of cssFiles) {
      const relPath = toPosix(filePath);
      if (relPath === ownerFile) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of patterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const line = lineNumberAt(content, match.index ?? 0);
          failures.push(`${relPath}:${line} matches ${pattern.source} but owner is ${ownerFile}`);
        }
      }
    }
  }

  console.log(`[check-css-ownership] rules=${entries.length}, failures=${failures.length}`);
  if (failures.length > 0) {
    console.error('[check-css-ownership] failed');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log('[check-css-ownership] OK');
}

main();