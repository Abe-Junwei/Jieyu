#!/usr/bin/env node
/**
 * ARCH-2：盘点 `src/i18n/*Messages.ts` 是否通过 `t`/`tf` 或 `readMessageCatalog`
 * 接入 DICT_KEYS / dictionaries 词典真源。
 * 不修改仓库；供文档 `docs/execution/governance/i18n-ARCH-2-message-module-inventory-*.md` 对账。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const I18N = join(ROOT, 'src/i18n');

const files = readdirSync(I18N)
  .filter((name) => name.endsWith('Messages.ts') && name !== 'messages.ts' && !name.includes('.test.'));

const usesDictBackedMessages = (source) => (
  /\bt\s*\(/.test(source)
  || /\btf\s*\(/.test(source)
  || /\breadMessageCatalog\b/.test(source)
);
const isGovernanceExempt = (source) => source.includes('@i18n-governance-exempt');

const dictBacked = [];
const inlineOnly = [];

for (const name of files.sort()) {
  const text = readFileSync(join(I18N, name), 'utf8');
  if (isGovernanceExempt(text)) continue;
  (usesDictBackedMessages(text) ? dictBacked : inlineOnly).push(name);
}

console.log(`[report-arch2-i18n-message-modules] message modules (excl. messages.ts / governance-exempt): ${dictBacked.length + inlineOnly.length}`);
console.log(`- dict-backed via t()/tf() or readMessageCatalog(): ${dictBacked.length}`);
console.log(`- inline-only (no t()/tf()/readMessageCatalog()): ${inlineOnly.length}`);
if (dictBacked.length > 0) {
  console.log('\nDict-backed modules:');
  for (const f of dictBacked) console.log(`  - ${f}`);
}
if (inlineOnly.length > 0) {
  console.log('\nInline-only modules:');
  for (const f of inlineOnly) console.log(`  - ${f}`);
}
