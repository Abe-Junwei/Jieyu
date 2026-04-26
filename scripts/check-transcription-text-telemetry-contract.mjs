#!/usr/bin/env node
/**
 * Keeps ActionId registration aligned across:
 * - IntentRouter.ACTION_ID_SET
 * - voiceIntentUi.ACTION_LABEL_KEYS (keys + dict key values)
 * - dictKeys + en-US/zh-CN dictionary entries for those dict keys
 * - VoiceIntentLlmResolver DEFAULT_SYSTEM_PROMPT ActionId allowlist line
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const INTENT_ROUTER = path.join(repoRoot, 'src', 'services', 'IntentRouter.ts');
const VOICE_INTENT_UI = path.join(repoRoot, 'src', 'services', 'voiceIntentUi.ts');
const VOICE_LLM = path.join(repoRoot, 'src', 'services', 'VoiceIntentLlmResolver.ts');
const DICT_KEYS = path.join(repoRoot, 'src', 'i18n', 'dictKeys.ts');
const EN_US = path.join(repoRoot, 'src', 'i18n', 'dictionaries', 'en-US.ts');
const ZH_CN = path.join(repoRoot, 'src', 'i18n', 'dictionaries', 'zh-CN.ts');

function fail(messages) {
  console.error('check-transcription-text-telemetry-contract failed:');
  for (const m of messages) console.error(m);
  process.exit(1);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @returns {string[]} */
function parseActionIdSetFromIntentRouter(source) {
  const marker = "new Set<ActionId>([";
  const start = source.indexOf(marker);
  if (start < 0) fail([`Could not find ${marker} in IntentRouter.ts`]);
  const slice = source.slice(start + marker.length);
  const endRel = slice.indexOf(']);');
  if (endRel < 0) fail(['Could not find closing ]); for ACTION_ID_SET in IntentRouter.ts']);
  const block = slice.slice(0, endRel);
  const ids = [];
  const re = /'([a-zA-Z][a-zA-Z0-9_]*)'/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    ids.push(m[1]);
  }
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length > 0) {
    fail([`Duplicate ActionId entries in ACTION_ID_SET: ${[...new Set(dup)].sort().join(', ')}`]);
  }
  return ids;
}

/**
 * @returns {{ actionId: string, dictKey: string }[]}
 */
function parseActionLabelKeysFromVoiceIntentUi(source) {
  const out = [];
  const lineRe =
    /^\s{2}([a-zA-Z][a-zA-Z0-9_]*):\s*'(transcription\.voiceAction\.[^']+)'\s*,?\s*$/;
  for (const line of source.split('\n')) {
    const m = line.match(lineRe);
    if (m) out.push({ actionId: m[1], dictKey: m[2] });
  }
  return out;
}

/** @returns {Set<string>} */
function parseVoiceActionDictKeysFromDictKeys(source) {
  const set = new Set();
  const re = /'transcription\.voiceAction\.[^']+'/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    set.add(m[0].slice(1, -1));
  }
  return set;
}

/** @returns {Set<string>} */
function parseLlmAllowlistActionIds(source) {
  // Source uses Unicode escapes for the prefix and full stop suffix.
  const escaped =
    /'ActionId \\u4ec5\\u5141\\u8bb8\\uff1a([^']+)\\u3002'/;
  const m = source.match(escaped);
  if (!m) {
    fail([
      'Could not find ActionId allowlist string in VoiceIntentLlmResolver.ts (expected \\u4ec5\\u5141\\u8bb8\\uff1a … \\u3002).',
    ]);
  }
  const raw = m[1].trim();
  if (!raw) fail(['ActionId allowlist in VoiceIntentLlmResolver.ts is empty']);
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * @param {string} dictSource
 * @param {string} localeLabel
 * @param {string[]} dictKeys
 */
function assertDictionaryEntries(dictSource, localeLabel, dictKeys) {
  const problems = [];
  for (const key of dictKeys) {
    const keyPat = new RegExp(`['"]${escapeRegExp(key)}['"]\\s*:\\s*'`, 'm');
    if (!keyPat.test(dictSource)) {
      problems.push(`  missing key in ${localeLabel}: ${key}`);
      continue;
    }
    const valueRe = new RegExp(
      `['"]${escapeRegExp(key)}['"]\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`,
      'm',
    );
    const vm = dictSource.match(valueRe);
    if (!vm || vm[1].length === 0) {
      problems.push(`  empty or unparseable value in ${localeLabel}: ${key}`);
    }
  }
  return problems;
}

function main() {
  const intentSource = readFileSync(INTENT_ROUTER, 'utf8');
  const voiceUiSource = readFileSync(VOICE_INTENT_UI, 'utf8');
  const llmSource = readFileSync(VOICE_LLM, 'utf8');
  const dictKeysSource = readFileSync(DICT_KEYS, 'utf8');
  const enUs = readFileSync(EN_US, 'utf8');
  const zhCn = readFileSync(ZH_CN, 'utf8');

  const actionIdsFromSet = new Set(parseActionIdSetFromIntentRouter(intentSource));
  const labelRows = parseActionLabelKeysFromVoiceIntentUi(voiceUiSource);
  const labelActionIds = new Set(labelRows.map((r) => r.actionId));
  const dictKeysDeclared = parseVoiceActionDictKeysFromDictKeys(dictKeysSource);
  const llmIds = parseLlmAllowlistActionIds(llmSource);

  const errors = [];

  const onlyInSet = [...actionIdsFromSet].filter((id) => !labelActionIds.has(id)).sort();
  const onlyInLabels = [...labelActionIds].filter((id) => !actionIdsFromSet.has(id)).sort();
  if (onlyInSet.length || onlyInLabels.length) {
    errors.push('ACTION_ID_SET vs voiceIntentUi ACTION_LABEL_KEYS key mismatch:');
    if (onlyInSet.length) errors.push(`  only in IntentRouter ACTION_ID_SET: ${onlyInSet.join(', ')}`);
    if (onlyInLabels.length) errors.push(`  only in voiceIntentUi keys: ${onlyInLabels.join(', ')}`);
  }

  const seenUi = new Set();
  for (const row of labelRows) {
    if (seenUi.has(row.actionId)) {
      errors.push(`Duplicate ACTION_LABEL_KEYS entry for: ${row.actionId}`);
    }
    seenUi.add(row.actionId);
  }

  const onlyLlmMissing = [...actionIdsFromSet].filter((id) => !llmIds.has(id)).sort();
  const onlyLlmExtra = [...llmIds].filter((id) => !actionIdsFromSet.has(id)).sort();
  if (onlyLlmMissing.length || onlyLlmExtra.length) {
    errors.push('VoiceIntentLlmResolver ActionId allowlist vs ACTION_ID_SET mismatch:');
    if (onlyLlmMissing.length) errors.push(`  missing from LLM allowlist: ${onlyLlmMissing.join(', ')}`);
    if (onlyLlmExtra.length) errors.push(`  extra in LLM allowlist only: ${onlyLlmExtra.join(', ')}`);
  }

  const dictKeyList = [...new Set(labelRows.map((r) => r.dictKey))].sort();
  for (const dk of dictKeyList) {
    if (!dictKeysDeclared.has(dk)) {
      errors.push(`DictKey used in voiceIntentUi but not found in dictKeys.ts: ${dk}`);
    }
  }

  errors.push(
    ...assertDictionaryEntries(enUs, 'en-US.ts', dictKeyList),
    ...assertDictionaryEntries(zhCn, 'zh-CN.ts', dictKeyList),
  );

  if (errors.length > 0) fail(errors);

  console.log(
    `check-transcription-text-telemetry-contract passed (${actionIdsFromSet.size} ActionIds, ${dictKeyList.length} dict keys).`,
  );
}

main();
