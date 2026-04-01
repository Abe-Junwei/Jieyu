import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ALLOWLIST = new Set([
  'src/App.tsx',
  'src/i18n/index.ts',
  'src/i18n/index.test.ts',
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
    if (SOURCE_EXTENSIONS.has(ext)) files.push(fullPath);
  }
  return files;
}

function shouldSkip(relPath) {
  if (ALLOWLIST.has(relPath)) return true;
  return /\.(test|spec)\.[tj]sx?$/.test(relPath) || /[\\/]__tests__[\\/]/.test(relPath);
}

function main() {
  const files = walk(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const relPath = relative(ROOT, file);
    if (shouldSkip(relPath)) continue;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (!line.includes('detectLocale')) continue;
      violations.push({
        file: relPath,
        line: index + 1,
        text: line.trim(),
      });
    }
  }

  if (violations.length === 0) {
    console.log('[check-locale-usage] OK: runtime code uses useLocale/context instead of direct detectLocale.');
    return;
  }

  console.error('[check-locale-usage] Found forbidden direct detectLocale usage outside approved files:\n');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} -> ${item.text}`);
  }
  process.exit(1);
}

main();