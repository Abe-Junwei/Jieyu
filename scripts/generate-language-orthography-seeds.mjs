import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const CLDR_LIKELY_SUBTAGS_URL = 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/likelySubtags.json';
const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/language-support');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.csv');
const LIMIT = 500;

const SCRIPT_DISPLAY = new Intl.DisplayNames(['en'], { type: 'script' });

const WIKIDATA_QUERY = `
SELECT ?language ?iso639_3 ?iso639_1 ?languageLabel ?sitelinks
  (GROUP_CONCAT(DISTINCT ?glottocode; separator="|") AS ?glottocodes)
       (GROUP_CONCAT(DISTINCT ?scriptCode; separator="|") AS ?wikidataScriptCodes)
WHERE {
  ?language wdt:P31/wdt:P279* wd:Q34770;
            wdt:P220 ?iso639_3;
            wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?language wdt:P218 ?iso639_1. }
  OPTIONAL { ?language wdt:P1394 ?glottocode. }
  OPTIONAL {
    ?language wdt:P282 ?script.
    ?script wdt:P506 ?scriptCode.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?language ?iso639_3 ?iso639_1 ?languageLabel ?sitelinks
ORDER BY DESC(?sitelinks)
LIMIT ${LIMIT}
`;

function bindingValue(binding, key) {
  return binding[key]?.value?.trim() ?? '';
}

function parseQid(uri) {
  const lastSlash = uri.lastIndexOf('/');
  return lastSlash >= 0 ? uri.slice(lastSlash + 1) : uri;
}

function parseScriptCodes(raw) {
  return Array.from(new Set(
    raw
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

function parsePipeList(raw) {
  return Array.from(new Set(
    raw
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

function resolveLikelyScript(likelySubtags, ...languageCodes) {
  for (const code of languageCodes) {
    if (!code) continue;
    const match = likelySubtags[code];
    if (!match) continue;
    const parts = match.split(/[-_]/);
    const scriptCode = parts.find((part) => /^[A-Z][a-z]{3}$/.test(part));
    if (scriptCode) {
      return scriptCode;
    }
  }
  return '';
}

function resolveScriptName(scriptCode) {
  if (!scriptCode) return '';
  return SCRIPT_DISPLAY.of(scriptCode) ?? scriptCode;
}

function buildOrthographySeeds(entry) {
  const orderedScriptCodes = Array.from(new Set([
    ...(entry.defaultScript ? [entry.defaultScript] : []),
    ...entry.wikidataScriptCodes,
  ]));

  return orderedScriptCodes.map((scriptCode, index) => {
    const primary = index === 0;
    const inWikidata = entry.wikidataScriptCodes.includes(scriptCode);
    const source = primary && inWikidata
      ? 'cldr-default+wikidata'
      : primary
      ? 'cldr-default'
      : 'wikidata-writing-system';
    const scriptName = resolveScriptName(scriptCode);
    return {
      id: `${entry.iso6393}-${scriptCode.toLowerCase()}`,
      labelEn: `${entry.languageLabel} (${scriptName || scriptCode})`,
      scriptCode,
      scriptName,
      priority: primary ? 'primary' : 'secondary',
      source,
      reviewStatus: 'needs-review',
      seedKind: 'script-derived',
    };
  });
}

function toCsvValue(value) {
  const stringValue = String(value ?? '');
  if (/[,"\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

async function loadWikidataTopLanguages() {
  const response = await fetchJson(`${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(WIKIDATA_QUERY)}`, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'GitHubCopilot/1.0 (Jieyu language seed generator)',
    },
  });

  return response.results.bindings.map((binding, index) => ({
    rank: index + 1,
    qid: parseQid(bindingValue(binding, 'language')),
    iso6393: bindingValue(binding, 'iso639_3'),
    iso6391: bindingValue(binding, 'iso639_1'),
    glottocodes: parsePipeList(bindingValue(binding, 'glottocodes')),
    languageLabel: bindingValue(binding, 'languageLabel'),
    sitelinks: Number(bindingValue(binding, 'sitelinks')) || 0,
    wikidataScriptCodes: parseScriptCodes(bindingValue(binding, 'wikidataScriptCodes')),
  })).map((entry) => ({
    ...entry,
    glottocode: entry.glottocodes[0] ?? '',
  }));
}

async function loadLikelySubtags() {
  const response = await fetchJson(CLDR_LIKELY_SUBTAGS_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GitHubCopilot/1.0 (Jieyu language seed generator)',
    },
  });
  return response?.supplemental?.likelySubtags ?? {};
}

async function main() {
  const [languages, likelySubtags] = await Promise.all([
    loadWikidataTopLanguages(),
    loadLikelySubtags(),
  ]);

  const normalized = languages.map((entry) => {
    const defaultScript = resolveLikelyScript(likelySubtags, entry.iso6391, entry.iso6393)
      || entry.wikidataScriptCodes[0]
      || '';
    const orthographySeeds = buildOrthographySeeds({
      ...entry,
      defaultScript,
    });
    return {
      ...entry,
      defaultScript,
      defaultScriptName: resolveScriptName(defaultScript),
      orthographySeeds,
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    limit: LIMIT,
    methodology: {
      rankingSource: 'Wikidata sitelinks proxy',
      scriptSource: 'Unicode CLDR likelySubtags + Wikidata P282/P506 fallback',
      languageNormalization: 'ISO 639-3 + ISO 639-1 + Glottocode',
      note: 'Orthography seeds are script-derived defaults for product support and still require human review for multi-orthography languages.',
    },
    sources: [
      'https://www.wikidata.org/wiki/Wikidata:Data_access',
      'https://query.wikidata.org/',
      'https://cldr.unicode.org/',
      'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/likelySubtags.json',
    ],
    languages: normalized,
  };

  const csvRows = [
    [
      'rank',
      'iso6393',
      'iso6391',
      'glottocode',
      'qid',
      'languageLabel',
      'sitelinks',
      'defaultScript',
      'defaultScriptName',
      'orthographyId',
      'orthographyLabelEn',
      'orthographyScriptCode',
      'orthographyScriptName',
      'orthographyPriority',
      'orthographySource',
      'reviewStatus',
      'seedKind',
    ].join(','),
  ];

  normalized.forEach((entry) => {
    entry.orthographySeeds.forEach((seed) => {
      csvRows.push([
        entry.rank,
        entry.iso6393,
        entry.iso6391,
        entry.glottocode,
        entry.qid,
        entry.languageLabel,
        entry.sitelinks,
        entry.defaultScript,
        entry.defaultScriptName,
        seed.id,
        seed.labelEn,
        seed.scriptCode,
        seed.scriptName,
        seed.priority,
        seed.source,
        seed.reviewStatus,
        seed.seedKind,
      ].map(toCsvValue).join(','));
    });
  });

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(OUTPUT_CSV, `${csvRows.join('\n')}\n`, 'utf8');

  console.log(`Generated ${normalized.length} language seeds.`);
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`CSV: ${OUTPUT_CSV}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});