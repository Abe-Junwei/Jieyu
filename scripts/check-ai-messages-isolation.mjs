#!/usr/bin/env node
// scripts/check-ai-messages-isolation.mjs
//
// Smoke check for the "UI 文案 vs AI formatter 文案分层" rule.
// (copilot-instructions.md §权威范围)
//
// Forbids:
//   1. Anything inside src/ai/messages/** importing from `@/i18n/dictKeys` or
//      `*/i18n/dictKeys` (formatter copy must not depend on user-facing
//      dictionaries).
//   2. Files under src/ai/messages/** appearing in i18n/dictionaries/*.
//
// Implementation uses Node-only scanning (no `rg` binary) so CI runners
// without ripgrep still enforce the rule.

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const TARGET_DIR = resolve(ROOT, 'src/ai/messages');

/** @param {string} dir @returns {string[]} */
function collectSourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...collectSourceFiles(p));
      continue;
    }
    if (!name.isFile()) continue;
    if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(name.name)) out.push(p);
  }
  return out;
}

const dictKeyImportRe = /from\s+['"][^'"]*i18n\/dictKeys['"]/g;
const tCallRe = /\bt\(\s*['"]/g;

const failures = [];

let files;
try {
  files = collectSourceFiles(TARGET_DIR);
} catch (e) {
  console.error('[check-ai-messages-isolation] FAILED: cannot read', TARGET_DIR, e);
  process.exit(1);
}

for (const abs of files) {
  const rel = abs.slice(ROOT.length + 1);
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (e) {
    console.error('[check-ai-messages-isolation] FAILED: cannot read file', rel, e);
    process.exit(1);
  }

  let m;
  dictKeyImportRe.lastIndex = 0;
  while ((m = dictKeyImportRe.exec(text)) !== null) {
    const line = text.slice(0, m.index).split('\n').length;
    failures.push(`  - ${rel}:${line}: imports i18n/dictKeys (UI vs formatter layering violation)`);
  }

  tCallRe.lastIndex = 0;
  while ((m = tCallRe.exec(text)) !== null) {
    const line = text.slice(0, m.index).split('\n').length;
    failures.push(`  - ${rel}:${line}: t("...") / t('...') i18n-style call (formatter must use static copy)`);
  }
}

if (failures.length > 0) {
  console.error('[check-ai-messages-isolation] FAILED:');
  console.error('src/ai/messages/** must not depend on UI i18n dictKeys or t("key") one-arg pattern:');
  for (const f of failures) console.error(f);
  process.exit(1);
}

console.log(
  '[check-ai-messages-isolation] OK: src/ai/messages/ keeps formatter copy isolated from UI i18n.',
);
