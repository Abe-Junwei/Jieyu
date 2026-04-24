/**
 * Splits monolithic i18n index into dictKeys + per-locale dictionary modules (B-1).
 * Input file must still contain inline `export const DICT_KEYS = [` … `export const dictionaries = {`.
 * The slim `src/i18n/index.ts` (post–B-1) no longer has that block — use a snapshot:
 *   git show <rev>:src/i18n/index.ts > src/i18n/_index.full.snapshot.ts
 *   node scripts/split-i18n-dictionaries.mjs src/i18n/_index.full.snapshot.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultInput = path.join(root, 'src/i18n/_index.full.snapshot.ts');
const inputPath = path.resolve(root, process.argv[2] ?? defaultInput);

const lines = fs.readFileSync(inputPath, 'utf8').split(/\n/);

const dictKeysStart = lines.findIndex((l) => l.startsWith('// Key naming convention:'));
const dictKeysEndExclusive = lines.findIndex((l) => l === 'export const dictionaries = {');
if (dictKeysStart < 0 || dictKeysEndExclusive < 0) {
  throw new Error('Could not locate DICT_KEYS block or dictionaries start');
}

const zhOpen = lines.findIndex((l) => l.includes("'zh-CN': {"));
const enOpen = lines.findIndex((l) => l.includes("'en-US': {"));
const satisfiesLine = lines.findIndex((l) => l.startsWith('} satisfies Record<Locale'));
if (zhOpen < 0 || enOpen < 0 || satisfiesLine < 0) {
  throw new Error('Could not locate zh-CN / en-US / satisfies boundaries');
}

const dictKeysPath = path.join(root, 'src/i18n/dictKeys.ts');
const dictDir = path.join(root, 'src/i18n/dictionaries');
const zhPath = path.join(dictDir, 'zh-CN.ts');
const enPath = path.join(dictDir, 'en-US.ts');
fs.mkdirSync(dictDir, { recursive: true });

const dictKeysBody = lines.slice(dictKeysStart, dictKeysEndExclusive).join('\n');
fs.writeFileSync(dictKeysPath, `${dictKeysBody}\n`, 'utf8');

const zhBody = lines.slice(zhOpen + 1, enOpen - 1).join('\n');
fs.writeFileSync(
  zhPath,
  `import type { DictKey } from '../dictKeys';\n\nexport const zhCNDictionary = {\n${zhBody}\n} as const satisfies Record<DictKey, string>;\n`,
  'utf8',
);

const enBody = lines.slice(enOpen + 1, satisfiesLine - 1).join('\n');
fs.writeFileSync(
  enPath,
  `import type { DictKey } from '../dictKeys';\n\nexport const enUSDictionary = {\n${enBody}\n} as const satisfies Record<DictKey, string>;\n`,
  'utf8',
);

console.log('Wrote', dictKeysPath, zhPath, enPath);
