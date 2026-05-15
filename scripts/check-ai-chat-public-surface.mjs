/**
 * Phase D1 — `src/ai/chat` 公共表面与页面穿透门禁：
 * - `src/ai/chat/index.ts` 导出符号必须与下方白名单一致（≤10）。
 * - `src/pages/**` 不得从 `.../ai/chat/.../internal/...` 导入（预留内部目录契约）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'src/ai/chat/index.ts');
const PAGES_DIR = path.join(ROOT, 'src/pages');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** 与 `src/ai/chat/index.ts` 中 `export { ... }` 名称保持一致。 */
const EXPECTED_EXPORTS = new Set([
  'loadSessionMemory',
  'persistSessionMemory',
  'resetSessionMemoryForClear',
  'completeAgentLoopCheckpointTask',
  'persistAgentLoopCheckpointTask',
  'runAgentLoop',
  'resolveToolDecisionPipeline',
  'buildWorldModelSnapshot',
  'executeLocalContextToolCall',
  'buildPromptContextBlock',
]);

function walkSourceFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walkSourceFiles(full));
      continue;
    }
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot) : '';
    if (SOURCE_EXTENSIONS.has(ext)) out.push(full);
  }
  return out;
}

function collectExportedNamesFromIndex(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s*\{([^}]+)\}\s*from/g)) {
    for (const raw of m[1].split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const withoutType = part.replace(/^type\s+/, '');
      const ident = withoutType.split(/\s+as\s+/)[0].trim();
      if (ident) names.add(ident);
    }
  }
  return names;
}

function findInternalAiChatImportsInPages() {
  const hits = [];
  const importRe = /from\s+['"]([^'"]+)['"]/g;
  for (const file of walkSourceFiles(PAGES_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = importRe.exec(text)) !== null) {
      const spec = m[1].replaceAll('\\', '/');
      if (!spec.includes('ai/chat')) continue;
      if (spec.includes('/internal/')) {
        hits.push({ file: path.relative(ROOT, file), spec });
      }
    }
  }
  return hits;
}

function main() {
  const indexSrc = fs.readFileSync(INDEX_PATH, 'utf8');
  const exported = collectExportedNamesFromIndex(indexSrc);

  if (exported.size !== EXPECTED_EXPORTS.size) {
    console.error(
      `[check-ai-chat-public-surface] export count mismatch: index has ${exported.size}, expected ${EXPECTED_EXPORTS.size}`,
    );
    process.exit(1);
  }

  for (const name of exported) {
    if (!EXPECTED_EXPORTS.has(name)) {
      console.error(
        `[check-ai-chat-public-surface] unexpected export "${name}" — update src/ai/chat/index.ts or EXPECTED_EXPORTS in this script`,
      );
      process.exit(1);
    }
  }
  for (const name of EXPECTED_EXPORTS) {
    if (!exported.has(name)) {
      console.error(
        `[check-ai-chat-public-surface] missing export "${name}" in src/ai/chat/index.ts`,
      );
      process.exit(1);
    }
  }

  const bad = findInternalAiChatImportsInPages();
  if (bad.length > 0) {
    console.error('[check-ai-chat-public-surface] pages must not import ai/chat internal paths:');
    for (const h of bad) {
      console.error(`  - ${h.file}: from '${h.spec}'`);
    }
    process.exit(1);
  }

  console.log('[check-ai-chat-public-surface] OK');
}

main();
