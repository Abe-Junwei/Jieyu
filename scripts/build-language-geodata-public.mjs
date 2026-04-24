/**
 * Extract ISO 639-3 seed rows from generated TS into public JSON for runtime fetch (B-3).
 *
 * Usage: node scripts/build-language-geodata-public.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src/data/generated/iso6393Seed.generated.ts');
const OUT = path.join(ROOT, 'public/data/language-support/iso6393-seed-rows.json');

const text = fs.readFileSync(SRC, 'utf8');
const marker = 'export const GENERATED_ISO6393_SEED_ROWS';
const startIdx = text.indexOf(marker);
if (startIdx < 0) {
  throw new Error(`Missing ${marker} in ${SRC}`);
}
// Skip `Iso639_3SeedRow[]` — first `[` after `=` is the row array opener on the next line
const bracketStart = text.indexOf('\n[', startIdx);
if (bracketStart < 0) {
  throw new Error('Missing array start after export');
}
const arrayStart = bracketStart + 1;
const asConst = text.lastIndexOf('] as const');
if (asConst < bracketStart) {
  throw new Error('Missing ] as const terminator');
}
const jsonSlice = text.slice(arrayStart, asConst + 1);
let rows;
try {
  rows = JSON.parse(jsonSlice);
} catch (e) {
  throw new Error(`Failed to JSON.parse extracted seed array: ${e}`);
}
if (!Array.isArray(rows)) {
  throw new Error('Expected top-level JSON array');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(rows)}\n`, 'utf8');
console.log('[build-language-geodata-public] wrote', path.relative(ROOT, OUT), 'rows=', rows.length);
