import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

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
  if (relPath.startsWith('src/i18n/')) return true;
  return /\.(test|spec)\.[tj]sx?$/.test(relPath) || /[\\/]__tests__[\\/]/.test(relPath);
}

function isForbiddenI18nImportPath(importPath) {
  const normalized = importPath.replaceAll('\\', '/');
  if (!normalized.includes('/i18n/')) return false;
  if (normalized.endsWith('/i18n/messages')) return false;
  if (/\/i18n\/[^'"/]+Messages$/.test(normalized)) return true;
  if (normalized.endsWith('/i18n/timelineParityMatrixMessages')) return true;
  return false;
}

function main() {
  const files = walk(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const relPath = relative(ROOT, file).replaceAll('\\', '/');
    if (shouldSkip(relPath)) continue;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const match = line.match(/\bfrom\s+['"]([^'"]+)['"]/);
      if (!match) continue;
      const importPath = match[1] ?? '';
      if (!isForbiddenI18nImportPath(importPath)) continue;
      violations.push({
        file: relPath,
        line: index + 1,
        text: line.trim(),
      });
    }
  }

  if (violations.length === 0) {
    console.log('[check-i18n-message-imports] OK: i18n message imports use unified "i18n/messages" barrel.');
    return;
  }

  console.error('[check-i18n-message-imports] Found direct message-module imports. Use "../i18n/messages" (or depth-equivalent) instead:\n');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} -> ${item.text}`);
  }
  process.exit(1);
}

main();
