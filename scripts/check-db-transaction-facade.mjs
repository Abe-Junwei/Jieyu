import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SERVICES_DIR = join(ROOT, 'src', 'services');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const ALLOWLIST_PATH_SUFFIXES = new Set([
  // 守卫脚本本身与历史快照不在该检查器扫描范围 | Guard script itself and legacy snapshots are not scanned by this checker.
]);

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    const dot = entry.lastIndexOf('.');
    const ext = dot >= 0 ? entry.slice(dot) : '';
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
    if (entry.endsWith('.spec.ts') || entry.endsWith('.spec.tsx')) continue;

    files.push(fullPath);
  }
  return files;
}

function isAllowlisted(filePath) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  for (const suffix of ALLOWLIST_PATH_SUFFIXES) {
    if (rel.endsWith(suffix)) return true;
  }
  return false;
}

function main() {
  const files = walk(SERVICES_DIR);
  const violations = [];

  for (const file of files) {
    if (isAllowlisted(file)) continue;
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (!line.includes('db.dexie.transaction(')) continue;
      violations.push({
        file: relative(ROOT, file),
        line: index + 1,
        text: line.trim(),
      });
    }
  }

  if (violations.length === 0) {
    console.log('[check-db-transaction-facade] OK: no direct db.dexie.transaction(...) in src/services.');
    return;
  }

  console.error('[check-db-transaction-facade] Found direct db.dexie.transaction(...) usages. Use withTransaction(...) instead:\n');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} -> ${item.text}`);
  }
  process.exit(1);
}

main();
