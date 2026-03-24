import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');

// 禁止直接导入分层消息文件，统一走 ai/messages 入口 | Disallow direct imports from split message modules; use ai/messages barrel only.
const FORBIDDEN_PATTERNS = [
  /ai\/messages\/toolFeedback/,
  /ai\/messages\/conversationFeedback/,
  /ai\/messages\/providerFeedback/,
  /ai\/messages\/systemFeedback/,
];

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

function main() {
  const files = walk(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (!pattern.test(line)) continue;
        violations.push({
          file: relative(ROOT, file),
          line: index + 1,
          text: line.trim(),
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log('[check-message-imports] OK: no direct split-module imports found.');
    return;
  }

  console.error('[check-message-imports] Found forbidden imports. Use "../ai/messages" barrel export instead:\n');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} -> ${item.text}`);
  }
  process.exit(1);
}

main();