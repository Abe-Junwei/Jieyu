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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const TARGET_DIR = 'src/ai/messages';

function rg(pattern, options = []) {
  try {
    const out = execFileSync('rg', ['-n', '--no-heading', ...options, pattern, TARGET_DIR], {
      cwd: ROOT, encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    if (err.status === 1) return [];
    throw err;
  }
}

const failures = [];

// Rule 1: src/ai/messages/** must not import i18n dictKeys.
const dictKeyImports = rg("from ['\"][^'\"]*i18n/dictKeys");
if (dictKeyImports.length > 0) {
  failures.push(`src/ai/messages/** imports i18n/dictKeys (UI 文案 vs formatter 分层违规):`);
  for (const line of dictKeyImports) failures.push(`  - ${line}`);
}

// Rule 2: src/ai/messages/** must not reference t()/translate() i18n calls.
const tCalls = rg("\\bt\\(['\"]");
if (tCalls.length > 0) {
  failures.push(`src/ai/messages/** uses t(...) i18n call (formatter must produce static copy):`);
  for (const line of tCalls) failures.push(`  - ${line}`);
}

if (failures.length > 0) {
  console.error('[check-ai-messages-isolation] FAILED:');
  for (const f of failures) console.error(f);
  process.exit(1);
}

console.log('[check-ai-messages-isolation] OK: src/ai/messages/ keeps formatter copy isolated from UI i18n.');
