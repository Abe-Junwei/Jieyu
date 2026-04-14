#!/usr/bin/env node
/**
 * Build ISO 639-3 → country baselines: distribution (Glottolog CLDF) + official (CLDR supplemental).
 * Pinned sources (reproducible): see SOURCE_* constants below.
 *
 * Usage: node scripts/build-iso6393-country-baselines.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { iso6393 } from 'iso-639-3';
import { languages } from 'language-tags';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'public/data/language-support/iso6393-country-baselines.json');
const REPORT_DIR = path.join(ROOT, '.tmp');
const REPORT_JSON = path.join(REPORT_DIR, 'iso6393-country-baselines-report.json');
const REPORTS_RULES_MD = path.join(ROOT, 'reports/iso6393-country-baselines.md');

/** Fail build if gzip-compressed JSON grows beyond this (regression guard; current ~54 KiB). */
const MAX_ARTIFACT_GZIP_BYTES = 200_000;

/** Glottolog CLDF — tag v5.3 (pin; do not use floating master). */
const GLOTTOLOG_LANGUAGES_CSV_URL =
  'https://raw.githubusercontent.com/glottolog/glottolog-cldf/v5.3/cldf/languages.csv';

/** Unicode CLDR — release-46 supplementalData.xml */
const CLDR_SUPPLEMENTAL_XML_URL =
  'https://raw.githubusercontent.com/unicode-org/cldr/release-46/common/supplemental/supplementalData.xml';

const OFFICIAL_STATUS_WHITELIST = new Set(['official', 'official_regional', 'de_facto_official']);

/** UN M.49 numeric regions → skip or map; we only keep ISO 3166-1 alpha-2 in output */
function isIso3166Alpha2(code) {
  return /^[A-Z]{2}$/.test(code);
}

function sortUniqueIso2(set) {
  return [...set].filter(isIso3166Alpha2).sort((a, b) => a.localeCompare(b));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Jieyu-build-iso6393-country-baselines/1.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

/**
 * Glottolog CLDF languages.csv — Countries + ISO639P3code, Level === language
 */
function parseGlottologDistribution(csv) {
  const lines = csv.split('\n');
  const header = lines[0].split(',');
  const idxId = header.indexOf('ID');
  const idxISO = header.indexOf('ISO639P3code');
  const idxLevel = header.indexOf('Level');
  const idxCountries = header.indexOf('Countries');
  if (idxISO < 0 || idxLevel < 0 || idxCountries < 0) {
    throw new Error('Glottolog CSV: missing ISO639P3code/Level/Countries column');
  }

  /** @type {Map<string, Set<string>>} */
  const byIso = new Map();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const level = cols[idxLevel]?.trim();
    if (level !== 'language') continue;
    const iso = cols[idxISO]?.trim().toLowerCase();
    if (!iso || iso.length !== 3) continue;
    const countriesRaw = cols[idxCountries]?.trim();
    if (!countriesRaw) continue;
    const parts = countriesRaw.split(/\s+/).filter(Boolean);
    if (!byIso.has(iso)) byIso.set(iso, new Set());
    const bucket = byIso.get(iso);
    for (const p of parts) {
      const c = p.toUpperCase();
      if (isIso3166Alpha2(c)) bucket.add(c);
    }
  }

  return byIso;
}

/**
 * Parse CLDR supplementalData.xml for official-status language populations.
 * Returns Map iso6393 lowercase -> Set ISO2
 */
function parseCldrOfficial(xml, validIso6393, iso6391ToIso6393List) {
  /** @type {Map<string, Set<string>>} */
  const acc = new Map();

  const add = (code, territory) => {
    const t = territory.toUpperCase();
    if (!isIso3166Alpha2(t)) return;
    const c = code.toLowerCase();
    if (!acc.has(c)) acc.set(c, new Set());
    acc.get(c).add(t);
  };

  const territoryBlockRe = /<territory type="([^"]+)"[^>]*>([\s\S]*?)<\/territory>/g;
  const lpRe = /<languagePopulation\s+([^/]+?)\/>/g;

  let tm;
  while ((tm = territoryBlockRe.exec(xml)) !== null) {
    const territoryType = tm[1];
    const block = tm[2];
    if (!/^[A-Z]{2}$/.test(territoryType)) continue;

    let lm;
    while ((lm = lpRe.exec(block)) !== null) {
      const attrs = lm[1];
      const typeM = attrs.match(/\btype="([^"]+)"/);
      const statusM = attrs.match(/\bofficialStatus="([^"]+)"/);
      if (!typeM || !statusM) continue;
      const status = statusM[1];
      if (!OFFICIAL_STATUS_WHITELIST.has(status)) continue;

      let langType = typeM[1].replace(/_/g, '-').split('-')[0].toLowerCase();
      if (!langType) continue;

      const targets = new Set();
      if (langType.length === 3 && validIso6393.has(langType)) {
        targets.add(langType);
      } else if (langType.length === 2) {
        const list = iso6391ToIso6393List.get(langType) ?? [];
        list.forEach((x) => targets.add(x));
        const macro6393 = iso6393
          .filter((e) => e.iso6391 === langType && e.scope === 'macrolanguage')
          .map((e) => e.iso6393.toLowerCase());
        macro6393.forEach((x) => targets.add(x));
        try {
          languages(langType).forEach((s) => {
            ianaExtlangToIso6393List(s.format(), validIso6393, iso6391ToIso6393List).forEach((x) => targets.add(x));
          });
        } catch {
          /* not an IANA macrolanguage subtag */
        }
      }

      targets.forEach((iso) => add(iso, territoryType));
    }
    lpRe.lastIndex = 0;
  }

  return acc;
}

function buildIso6391ToList() {
  /** @type {Map<string, string[]>} */
  const m = new Map();
  for (const e of iso6393) {
    const i1 = e.iso6391?.toLowerCase();
    if (!i1) continue;
    const i3 = e.iso6393.toLowerCase();
    const arr = m.get(i1) ?? [];
    arr.push(i3);
    m.set(i1, arr);
  }
  return m;
}

function ianaExtlangToIso6393List(subtagFmt, validIso6393, iso6391ToIso6393List) {
  const fmt = subtagFmt.toLowerCase();
  const out = [];
  if (fmt.length === 3 && validIso6393.has(fmt)) {
    out.push(fmt);
    return out;
  }
  if (fmt.length === 2) {
    (iso6391ToIso6393List.get(fmt) ?? []).forEach((x) => out.push(x));
  }
  return out;
}

/**
 * Expand macrolanguage M (ISO 639-3) → encompassed individual codes via IANA + iso6393.
 */
function macroToMemberIso6393(macroRow, validIso6393, iso6391ToIso6393List, memo) {
  const key = macroRow.iso6393.toLowerCase();
  if (memo.has(key)) return memo.get(key);
  if (macroRow.scope !== 'macrolanguage' || !macroRow.iso6391) {
    memo.set(key, []);
    return [];
  }
  let subs;
  try {
    subs = languages(macroRow.iso6391);
  } catch {
    memo.set(key, []);
    return [];
  }
  const members = new Set();
  for (const s of subs) {
    const codes = ianaExtlangToIso6393List(s.format(), validIso6393, iso6391ToIso6393List);
    codes.forEach((c) => {
      if (validIso6393.has(c)) members.add(c);
    });
  }
  const arr = [...members];
  memo.set(key, arr);
  return arr;
}

function unionSets(sets) {
  const u = new Set();
  sets.forEach((s) => s.forEach((x) => u.add(x)));
  return u;
}

async function main() {
  const validIso6393 = new Set(iso6393.map((e) => e.iso6393.toLowerCase()));
  const iso6391ToIso6393List = buildIso6391ToList();
  const iso6393ByCode = new Map(iso6393.map((e) => [e.iso6393.toLowerCase(), e]));

  console.log('Fetching Glottolog CLDF languages.csv …');
  const glottoCsv = await fetchText(GLOTTOLOG_LANGUAGES_CSV_URL);
  const glottoMap = parseGlottologDistribution(glottoCsv);

  console.log('Fetching CLDR supplementalData.xml …');
  const cldrXml = await fetchText(CLDR_SUPPLEMENTAL_XML_URL);
  const cldrIndividual = parseCldrOfficial(cldrXml, validIso6393, iso6391ToIso6393List);

  const macroMemo = new Map();
  const macros = iso6393.filter((e) => e.scope === 'macrolanguage');

  /** @type {Map<string, Set<string>>} */
  const distribution = new Map();
  /** @type {Map<string, Set<string>>} */
  const official = new Map();

  for (const code of validIso6393) {
    distribution.set(code, new Set(glottoMap.get(code) ?? []));
    official.set(code, new Set(cldrIndividual.get(code) ?? []));
  }

  for (const M of macros) {
    const m = M.iso6393.toLowerCase();
    const members = macroToMemberIso6393(M, validIso6393, iso6391ToIso6393List, macroMemo);
    const distUnion = unionSets(members.map((c) => distribution.get(c) ?? new Set()));
    const offUnion = unionSets(members.map((c) => official.get(c) ?? new Set()));
    const mergedDist = new Set([...(distribution.get(m) ?? []), ...distUnion]);
    const mergedOff = new Set([...(official.get(m) ?? []), ...offUnion]);
    distribution.set(m, mergedDist);
    official.set(m, mergedOff);
  }

  /** JSON outputs */
  const distributionByIso6393 = {};
  const officialByIso6393 = {};
  for (const code of [...validIso6393].sort()) {
    distributionByIso6393[code] = sortUniqueIso2(distribution.get(code) ?? new Set());
    officialByIso6393[code] = sortUniqueIso2(official.get(code) ?? new Set());
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      glottologCldfLanguagesCsv: GLOTTOLOG_LANGUAGES_CSV_URL,
      cldrSupplementalDataXml: CLDR_SUPPLEMENTAL_XML_URL,
      officialStatusWhitelist: [...OFFICIAL_STATUS_WHITELIST],
      iso6393PackageVersion: 'iso-639-3 (see package.json)',
    },
    distributionByIso6393,
    officialByIso6393,
  };

  const outText = `${JSON.stringify(payload, null, 2)}\n`;
  const gzipBytes = gzipSync(Buffer.from(outText, 'utf8')).length;
  if (gzipBytes > MAX_ARTIFACT_GZIP_BYTES) {
    throw new Error(
      `iso6393-country-baselines.json gzip size ${gzipBytes} B exceeds limit ${MAX_ARTIFACT_GZIP_BYTES} B — review data growth or raise threshold deliberately.`,
    );
  }

  await mkdir(path.dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, outText, 'utf8');
  console.log(`Wrote ${OUT_JSON} (${gzipBytes} B gzip)`);

  let glottoNonEmpty = 0;
  let cldrNonEmpty = 0;
  let bothNonEmpty = 0;
  let symDiffCount = 0;
  const symDiffSample = [];
  for (const code of validIso6393) {
    const d = new Set(distributionByIso6393[code]);
    const o = new Set(officialByIso6393[code]);
    if (d.size) glottoNonEmpty++;
    if (o.size) cldrNonEmpty++;
    if (d.size && o.size) bothNonEmpty++;
    const onlyG = [...d].filter((x) => !o.has(x));
    const onlyO = [...o].filter((x) => !d.has(x));
    if (onlyG.length || onlyO.length) {
      symDiffCount++;
      if (symDiffSample.length < 30) {
        symDiffSample.push({ code, onlyDistribution: onlyG, onlyOfficial: onlyO });
      }
    }
  }

  const report = {
    generatedAt: payload.generatedAt,
    counts: {
      totalIso6393: validIso6393.size,
      distributionNonEmpty: glottoNonEmpty,
      officialNonEmpty: cldrNonEmpty,
      bothNonEmpty,
      codesWithSymmetricDiff: symDiffCount,
    },
    symmetricDiffSample: symDiffSample,
    notes: [
      'distribution: Glottolog CLDF Countries column, language level, merged by ISO639P3code',
      'official: CLDR languagePopulation with officialStatus in whitelist, mapped to ISO 639-3',
      'macrolanguages: union of member distribution/official plus any direct rows',
    ],
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${REPORT_JSON}`);

  const rulesMd = `# ISO 639-3 country baselines (build rules)

Generated: ${payload.generatedAt} (from last \`npm run data:iso6393-country-baselines\`).

## Pinned inputs

- **Glottolog CLDF** \`languages.csv\`:  
  \`${GLOTTOLOG_LANGUAGES_CSV_URL}\`
- **CLDR supplemental**:  
  \`${CLDR_SUPPLEMENTAL_XML_URL}\`

## Distribution (\`distributionByIso6393\`)

- Rows with \`Level === "language"\` only.
- Read \`Countries\` (space-separated ISO 3166-1 alpha-2); merge **all** languoids that share the same \`ISO639P3code\` into one sorted, deduped list per ISO 639-3.

## Official status (\`officialByIso6393\`)

- Scan \`<territory type="XX">\` blocks (two-letter regions only).
- For each \`<languagePopulation />\` with \`officialStatus\` in: **${[...OFFICIAL_STATUS_WHITELIST].join('**, **')}**.
- Map BCP47 language subtag to ISO 639-3 (direct 3-letter, ISO 639-1 expansion via \`iso-639-3\`, IANA \`language-tags\` macrolanguage extlang paths). Skip unmapped tags.
- Territories: keep **alpha-2** only; skip UN M.49 numerics and other non–alpha-2 \`type\`.

## Macrolanguages

- For each ISO 639-3 row with \`scope === "macrolanguage"\` and an \`iso6391\` macrolanguage subtag, enumerate IANA extlang entries and map them to 639-3.
- **Per macrolanguage code** \`M\`:  
  \`distribution[M] = union(direct Glottolog for M, union of distribution[member])\`  
  \`official[M] = union(direct CLDR for M, union of official[member])\`  
  then sort/dedupe ISO2.

## Artifact size check

- Pretty-printed JSON is gzip-compressed in memory; build **fails** if gzip size exceeds **${MAX_ARTIFACT_GZIP_BYTES}** bytes (see script constant).

## Machine-readable report

- \`.tmp/iso6393-country-baselines-report.json\` — counts and symmetric-diff sample vs official/distribution.
`;
  await mkdir(path.dirname(REPORTS_RULES_MD), { recursive: true });
  await writeFile(REPORTS_RULES_MD, rulesMd, 'utf8');
  console.log(`Wrote ${REPORTS_RULES_MD}`);

  console.log('Counts:', report.counts);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
