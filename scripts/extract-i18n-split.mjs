/**
 * One-shot / maintenance: split monolithic `src/i18n/index.ts` into
 * `dictKeys.ts`, `dictionaries/zh-CN.ts`, `dictionaries/en-US.ts`.
 *
 * Usage: node scripts/extract-i18n-split.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const indexPath = path.join(ROOT, 'src/i18n/index.ts');

const raw = fs.readFileSync(indexPath, 'utf8');
const lines = raw.split(/\r?\n/);

const dictStart = lines.findIndex((l) => l.startsWith('export const dictionaries'));
if (dictStart < 0) throw new Error('Could not find export const dictionaries');

const zhMarker = lines.findIndex((l, idx) => idx > dictStart && /^\s*'zh-CN':\s*\{\s*$/.test(l));
const enMarker = lines.findIndex((l, idx) => idx > dictStart && /^\s*'en-US':\s*\{\s*$/.test(l));
const satLine = lines.findIndex((l, idx) => idx > dictStart && /^\}\s+satisfies\s+Record<Locale/.test(l));

if (zhMarker < 0 || enMarker < 0 || satLine < 0) {
  throw new Error(`Markers not found: zh=${zhMarker} en=${enMarker} sat=${satLine}`);
}

const dictKeysLines = lines.slice(20, dictStart);
const dictKeysBody = dictKeysLines.join('\n').trimEnd();
if (!dictKeysBody.includes('export const DICT_KEYS')) {
  throw new Error('Unexpected dictKeys slice: missing DICT_KEYS');
}

const zhFirst = zhMarker + 1;
const zhLastExclusive = enMarker;
const zhInner = lines.slice(zhFirst, zhLastExclusive);

const enFirst = enMarker + 1;
const enLastExclusive = satLine;
const enInner = lines.slice(enFirst, enLastExclusive);

const dictKeysPath = path.join(ROOT, 'src/i18n/dictKeys.ts');
const zhPath = path.join(ROOT, 'src/i18n/dictionaries/zh-CN.ts');
const enPath = path.join(ROOT, 'src/i18n/dictionaries/en-US.ts');
const dictDir = path.dirname(zhPath);

fs.mkdirSync(dictDir, { recursive: true });

fs.writeFileSync(
  dictKeysPath,
  `${dictKeysBody}
`,
  'utf8',
);

fs.writeFileSync(
  zhPath,
  `import type { DictKey } from '../dictKeys';

export const zhCNDictionary = {
${zhInner.join('\n')}
} satisfies Record<DictKey, string>;
`,
  'utf8',
);

fs.writeFileSync(
  enPath,
  `import type { DictKey } from '../dictKeys';

export const enUSDictionary = {
${enInner.join('\n')}
} satisfies Record<DictKey, string>;
`,
  'utf8',
);

console.log('[extract-i18n-split] Wrote', path.relative(ROOT, dictKeysPath), path.relative(ROOT, zhPath), path.relative(ROOT, enPath));
