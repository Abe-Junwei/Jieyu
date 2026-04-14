#!/usr/bin/env node
/**
 * Offline validation of committed iso6393-country-baselines.json (no network).
 * Keep MAX_GZIP_BYTES in sync with scripts/build-iso6393-country-baselines.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'public/data/language-support/iso6393-country-baselines.json');
const MAX_GZIP_BYTES = 200_000;
const EXPECTED_ISO6393_COUNT = 7867;

const raw = fs.readFileSync(JSON_PATH);
const gzipBytes = gzipSync(raw).length;
if (gzipBytes > MAX_GZIP_BYTES) {
  console.error(`iso6393-country-baselines: gzip ${gzipBytes} B exceeds ${MAX_GZIP_BYTES} B`);
  process.exit(1);
}

const data = JSON.parse(raw.toString('utf8'));
if (!data.distributionByIso6393 || !data.officialByIso6393) {
  console.error('iso6393-country-baselines: missing distributionByIso6393 or officialByIso6393');
  process.exit(1);
}

const n = Object.keys(data.distributionByIso6393).length;
if (n !== EXPECTED_ISO6393_COUNT) {
  console.error(`iso6393-country-baselines: expected ${EXPECTED_ISO6393_COUNT} keys, got ${n}`);
  process.exit(1);
}

console.log(`iso6393-country-baselines OK (gzip ${gzipBytes} B, ${n} codes)`);
