#!/usr/bin/env node
/**
 * 从 Glottolog CLDF 数据注入经纬度坐标到种子语言数据
 * Inject latitude/longitude from Glottolog CLDF into seed language data
 *
 * 用法 | Usage:
 *   node scripts/inject-glottolog-coordinates.mjs
 *
 * 数据源：https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv
 * Source: Glottolog CLDF languages.csv (ID = glottocode, with Latitude/Longitude columns)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, '..', 'public', 'data', 'language-support', 'top500-language-orthography-seeds.json');
const GLOTTOLOG_CSV_URL = 'https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv';

async function fetchGlottologCSV() {
  console.log('⬇  正在下载 Glottolog CLDF languages.csv … | Downloading Glottolog CLDF languages.csv …');
  const res = await fetch(GLOTTOLOG_CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.text();
}

/**
 * 解析 CSV 文本为 Map<glottocode, {lat, lng}> + Map<iso6393, {lat, lng}>
 * Parse CSV into lookup maps keyed by glottocode and ISO 639-3
 */
function parseGlottologCSV(csv) {
  const lines = csv.split('\n');
  const header = lines[0].split(',');
  const idxId = header.indexOf('ID');
  const idxLat = header.indexOf('Latitude');
  const idxLng = header.indexOf('Longitude');
  const idxISO = header.indexOf('ISO639P3code');
  const idxLevel = header.indexOf('Level');

  if (idxId < 0 || idxLat < 0 || idxLng < 0) {
    throw new Error('Unexpected CSV header – missing ID/Latitude/Longitude');
  }

  /** @type {Map<string, {lat: number, lng: number}>} */
  const byGlottocode = new Map();
  /** @type {Map<string, {lat: number, lng: number}>} */
  const byISO = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // 简单 CSV 拆分（Glottolog CSV 无引号字段） | Simple CSV split (no quoted fields)
    const cols = line.split(',');
    const lat = parseFloat(cols[idxLat]);
    const lng = parseFloat(cols[idxLng]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    // 只取 language 级别（排除 family / dialect） | Only language-level entries
    const level = cols[idxLevel]?.trim();
    if (level && level !== 'language') continue;

    const coord = { lat, lng };
    const glottocode = cols[idxId]?.trim();
    if (glottocode) byGlottocode.set(glottocode, coord);
    const iso = cols[idxISO]?.trim();
    if (iso) byISO.set(iso, coord);
  }

  return { byGlottocode, byISO };
}

async function main() {
  const csv = await fetchGlottologCSV();
  const { byGlottocode, byISO } = parseGlottologCSV(csv);
  console.log(`✓  Glottolog 语言级坐标: ${byGlottocode.size} glottocodes, ${byISO.size} ISO 639-3 codes`);

  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const languages = seed.languages;
  let matched = 0;
  let skipped = 0;

  for (const lang of languages) {
    // 优先用 glottocode 匹配，回退到 glottocodes 数组，最终回退到 iso6393
    // Prefer glottocode match, fall back to glottocodes array, then iso6393
    let coord = null;
    if (lang.glottocode) {
      coord = byGlottocode.get(lang.glottocode);
    }
    if (!coord && Array.isArray(lang.glottocodes)) {
      for (const gc of lang.glottocodes) {
        coord = byGlottocode.get(gc);
        if (coord) break;
      }
    }
    if (!coord && lang.iso6393) {
      coord = byISO.get(lang.iso6393);
    }

    if (coord) {
      lang.latitude = coord.lat;
      lang.longitude = coord.lng;
      matched++;
    } else {
      skipped++;
    }
  }

  // 更新生成时间戳 | Update timestamp
  seed.generatedAt = new Date().toISOString();

  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf-8');
  console.log(`✓  已注入坐标: ${matched} 条, 未匹配: ${skipped} 条 | Injected: ${matched}, unmatched: ${skipped}`);
}

main().catch((err) => {
  console.error('✗  注入失败 | Injection failed:', err);
  process.exit(1);
});
