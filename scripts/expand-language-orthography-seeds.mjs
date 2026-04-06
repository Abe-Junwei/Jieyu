import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const OMNIGLOT_LANGALPH_URL = 'https://www.omniglot.com/writing/langalph.htm';
const WWS_INDEX_URL = 'https://www.worldswritingsystems.org/index.php';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/language-support');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.json');
const BASELINE_JSON = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.baseline.json');
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.csv');
const OUTPUT_REPORT = path.join(OUTPUT_DIR, 'orthography-expansion-report.json');

const SCRIPT_DISPLAY = new Intl.DisplayNames(['en'], { type: 'script' });
const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Syrc', 'Thaa', 'Nkoo', 'Adlm', 'Rohg']);
const SCRIPT_ALIAS_TO_CODE = new Map([
  ['sharda', 'Shrd'],
  ['manchu', 'Mong'],
  ['eastern neo brahmic', 'Beng'],
  ['eastern nagari', 'Beng'],
  ['eastern nagari bengali', 'Beng'],
]);

function decodeHtmlEntities(value) {
  if (!value) return '';
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&([a-zA-Z])(grave|acute|circ|tilde|uml|cedil|ring|caron|slash|ogon);/g, (_, ch) => ch)
    .replace(/&([a-zA-Z])(grave|acute|circ|tilde|uml|cedil|ring|caron|slash|ogon)\b/g, (_, ch) => ch)
    .replace(/&szlig;/gi, 'ss');
}

function stripTags(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ');
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeWhitespace(decodeHtmlEntities(value))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bscript(s)?\b/g, ' ')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQid(uri) {
  const i = String(uri ?? '').lastIndexOf('/');
  return i >= 0 ? uri.slice(i + 1) : String(uri ?? '');
}

function parsePipe(raw) {
  return Array.from(new Set(String(raw ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)));
}

function toCsvValue(value) {
  const stringValue = String(value ?? '');
  if (/[,"\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'GitHubCopilot/1.0 (Jieyu orthography expansion)',
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return await response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return await response.json();
}

function extractAnchors(block, baseUrl) {
  const anchors = [];
  const re = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match = re.exec(block);
  while (match) {
    const href = match[1]?.trim() ?? '';
    const label = normalizeWhitespace(stripTags(decodeHtmlEntities(match[2] ?? '')));
    if (href && label) {
      anchors.push({
        href,
        url: new URL(href, baseUrl).href,
        label,
      });
    }
    match = re.exec(block);
  }
  return anchors;
}

function buildNameCandidates(name) {
  const source = normalizeWhitespace(name);
  if (!source) return [];
  const candidates = new Set();
  const push = (value) => {
    const normalized = normalizeKey(value);
    if (normalized) candidates.add(normalized);
  };
  push(source);
  push(source.replace(/\([^)]*\)/g, ' '));
  push(source.replace(/\[[^\]]*\]/g, ' '));
  source.split('/').forEach((part) => push(part));
  source.split(',').forEach((part) => push(part));
  source.split(' - ').forEach((part) => push(part));
  source.split(' – ').forEach((part) => push(part));
  source.split(':').forEach((part) => push(part));
  const noParen = source.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  noParen.split('/').forEach((part) => push(part));
  return Array.from(candidates);
}

function buildScriptCandidates(name) {
  const source = normalizeWhitespace(name);
  if (!source) return [];
  const candidates = new Set();
  const push = (value) => {
    const normalized = normalizeKey(value);
    if (normalized) candidates.add(normalized);
  };
  push(source);
  push(source.replace(/\([^)]*\)/g, ' '));
  source.split('/').forEach((part) => push(part));
  source.split(',').forEach((part) => push(part));
  source.split(' - ').forEach((part) => push(part));
  return Array.from(candidates);
}

function parseOmniglotLangalph(html) {
  const rows = [];
  const rowRe = /<tr>[\s\S]*?<\/tr>/gi;
  let match = rowRe.exec(html);
  while (match) {
    const row = match[0];
    const tdStart = [];
    const tdStartRe = /<td[^>]*>/gi;
    let tdMatch = tdStartRe.exec(row);
    while (tdMatch) {
      tdStart.push({ index: tdMatch.index, length: tdMatch[0].length });
      tdMatch = tdStartRe.exec(row);
    }

    if (tdStart.length < 2) {
      match = rowRe.exec(html);
      continue;
    }

    const firstCellStart = tdStart[0].index + tdStart[0].length;
    const secondCellTagIndex = tdStart[1].index;
    const secondCellStart = tdStart[1].index + tdStart[1].length;

    const firstCell = row.slice(firstCellStart, secondCellTagIndex);
    const secondCell = row.slice(secondCellStart);

    const scriptIdMatch = firstCell.match(/<a id="([^"]+)"><\/a>/i);
    const scriptLinkMatch = firstCell.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/i);
    if (!scriptLinkMatch) {
      match = rowRe.exec(html);
      continue;
    }

    const scriptHref = scriptLinkMatch[1];
    const scriptInner = scriptLinkMatch[2];
    const scriptNameRaw = scriptInner.split(/<br\s*\/?>/i).pop() ?? scriptInner;
    const scriptName = normalizeWhitespace(stripTags(decodeHtmlEntities(scriptNameRaw)));
    const scriptUrl = new URL(scriptHref, OMNIGLOT_LANGALPH_URL).href;
    const anchors = extractAnchors(secondCell, OMNIGLOT_LANGALPH_URL)
      .filter((entry) => /\/writing\/|\/chinese\//.test(entry.url));

    if (scriptName && anchors.length > 0) {
      rows.push({
        scriptId: scriptIdMatch?.[1] ?? '',
        scriptName,
        scriptUrl,
        languages: anchors.map((entry) => ({
          name: entry.label,
          url: entry.url,
        })),
      });
    }

    match = rowRe.exec(html);
  }
  return rows;
}

function parseWwsCatalog(html) {
  const scripts = [];
  const byName = new Map();
  const byCode = new Map();

  const itemRe = /<div class="grid-item[\s\S]*?id="item-\d+"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<!-- \/ grid-item -->/gi;
  let match = itemRe.exec(html);

  while (match) {
    const block = match[0];
    const nameMatch = block.match(/<h3 class="name">([\s\S]*?)<\/h3>/i);
    const dataNameMatch = block.match(/data-name="([^"]+)"/i);
    const stateMatch = block.match(/<p class="state">([\s\S]*?)<\/p>/i);
    const regionMatch = block.match(/<p class="region">([\s\S]*?)<\/p>/i);

    const name = normalizeWhitespace(stripTags(decodeHtmlEntities(nameMatch?.[1] ?? '')));
    if (!name) {
      match = itemRe.exec(html);
      continue;
    }

    const links = extractAnchors(block, WWS_INDEX_URL);
    const wikipediaLink = links.find((entry) => /wikipedia\.org/i.test(entry.url))?.url ?? '';
    const scriptsourceLink = links.find((entry) => /scriptsource\.org/i.test(entry.url))?.url ?? '';
    const scriptsourceKeyMatch = scriptsourceLink.match(/[?&]key=([A-Za-z0-9]+)/);
    const scriptsourceKey = scriptsourceKeyMatch?.[1] ?? '';
    const iso15924 = /^[A-Z][a-z]{3}$/.test(scriptsourceKey) ? scriptsourceKey : '';

    const item = {
      name,
      normalizedName: normalizeKey(name),
      dataName: dataNameMatch?.[1]?.trim() ?? '',
      state: normalizeWhitespace(stripTags(decodeHtmlEntities(stateMatch?.[1] ?? ''))),
      region: normalizeWhitespace(stripTags(decodeHtmlEntities(regionMatch?.[1] ?? ''))),
      wikipediaLink,
      scriptsourceLink,
      scriptsourceKey,
      iso15924,
      links,
    };

    scripts.push(item);
    byName.set(item.normalizedName, item);
    if (item.iso15924) {
      byCode.set(item.iso15924, item);
    }

    match = itemRe.exec(html);
  }

  return { scripts, byName, byCode };
}

async function runSparql(query) {
  const encoded = encodeURIComponent(query);
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encoded}`;
  const response = await fetchJson(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'GitHubCopilot/1.0 (Jieyu orthography expansion)',
    },
  });
  return Array.isArray(response?.results?.bindings) ? response.results.bindings : [];
}

function valueOf(binding, key) {
  return binding?.[key]?.value?.trim() ?? '';
}

async function loadWikidataScriptCatalog() {
  const query = `
SELECT ?script ?scriptLabel ?scriptCode ?article
       (GROUP_CONCAT(DISTINCT ?altLabel; separator="|") AS ?altLabels)
WHERE {
  ?script wdt:P506 ?scriptCode.
  OPTIONAL { ?script skos:altLabel ?altLabel. FILTER (lang(?altLabel) = "en") }
  OPTIONAL {
    ?article schema:about ?script;
             schema:isPartOf <https://en.wikipedia.org/>.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?script ?scriptLabel ?scriptCode ?article
`;

  const bindings = await runSparql(query);
  const byCode = new Map();
  const byName = new Map();

  bindings.forEach((binding) => {
    const scriptCode = valueOf(binding, 'scriptCode');
    if (!/^[A-Z][a-z]{3}$/.test(scriptCode)) return;

    const label = valueOf(binding, 'scriptLabel');
    const qid = parseQid(valueOf(binding, 'script'));
    const wikipediaUrl = valueOf(binding, 'article');
    const altLabels = parsePipe(valueOf(binding, 'altLabels'));

    const entry = {
      qid,
      scriptCode,
      label,
      wikipediaUrl,
      altLabels,
    };

    byCode.set(scriptCode, entry);
    buildScriptCandidates(label).forEach((candidate) => byName.set(candidate, entry));
    altLabels.forEach((alt) => {
      buildScriptCandidates(alt).forEach((candidate) => byName.set(candidate, entry));
    });
  });

  return { byCode, byName };
}

async function loadWikidataLanguageCatalog() {
  const query = `
SELECT ?language ?languageLabel ?iso639_3 ?iso639_1 ?article ?sitelinks
       (GROUP_CONCAT(DISTINCT ?altLabel; separator="|") AS ?altLabels)
       (GROUP_CONCAT(DISTINCT ?scriptCode; separator="|") AS ?wikidataScriptCodes)
WHERE {
  ?language wdt:P31/wdt:P279* wd:Q34770;
            wdt:P220 ?iso639_3;
            wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?language wdt:P218 ?iso639_1. }
  OPTIONAL { ?language skos:altLabel ?altLabel. FILTER (lang(?altLabel) = "en") }
  OPTIONAL {
    ?language wdt:P282 ?script.
    ?script wdt:P506 ?scriptCode.
  }
  OPTIONAL {
    ?article schema:about ?language;
             schema:isPartOf <https://en.wikipedia.org/>.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?language ?languageLabel ?iso639_3 ?iso639_1 ?article ?sitelinks
`;

  const bindings = await runSparql(query);
  const byIso6393 = new Map();
  const byName = new Map();

  bindings.forEach((binding) => {
    const iso6393 = valueOf(binding, 'iso639_3').toLowerCase();
    if (!iso6393) return;

    const entry = {
      qid: parseQid(valueOf(binding, 'language')),
      iso6393,
      iso6391: valueOf(binding, 'iso639_1').toLowerCase(),
      languageLabel: valueOf(binding, 'languageLabel'),
      sitelinks: Number(valueOf(binding, 'sitelinks')) || 0,
      wikipediaUrl: valueOf(binding, 'article'),
      altLabels: parsePipe(valueOf(binding, 'altLabels')),
      wikidataScriptCodes: parsePipe(valueOf(binding, 'wikidataScriptCodes')).filter((code) => /^[A-Z][a-z]{3}$/.test(code)),
    };

    const existing = byIso6393.get(iso6393);
    if (existing) {
      if (!existing.wikipediaUrl && entry.wikipediaUrl) existing.wikipediaUrl = entry.wikipediaUrl;
      if (!existing.iso6391 && entry.iso6391) existing.iso6391 = entry.iso6391;
      if (!existing.languageLabel && entry.languageLabel) existing.languageLabel = entry.languageLabel;
      existing.sitelinks = Math.max(existing.sitelinks || 0, entry.sitelinks || 0);
      existing.wikidataScriptCodes = Array.from(new Set([...(existing.wikidataScriptCodes ?? []), ...(entry.wikidataScriptCodes ?? [])]));
      existing.altLabels = Array.from(new Set([...(existing.altLabels ?? []), ...(entry.altLabels ?? [])]));
    } else {
      byIso6393.set(iso6393, entry);
    }

    const target = byIso6393.get(iso6393);
    buildNameCandidates(entry.languageLabel).forEach((candidate) => {
      if (!byName.has(candidate)) {
        byName.set(candidate, target);
      }
    });

    (target.altLabels ?? []).forEach((label) => {
      buildNameCandidates(label).forEach((candidate) => {
        if (!byName.has(candidate)) {
          byName.set(candidate, target);
        }
      });
    });
  });

  return { byIso6393, byName };
}

function parseScriptSource(scriptSource) {
  if (!scriptSource) return '';
  const keyMatch = scriptSource.match(/(?:\?|&)key=([A-Za-z0-9]+)/);
  return keyMatch?.[1] ?? '';
}

function resolveScript(scriptName, context) {
  const { baseScriptByName, wwsByName, wikidataScriptByName, wikidataScriptByCode, wwsByCode } = context;
  const candidates = buildScriptCandidates(scriptName);

  for (const candidate of candidates) {
    const aliasCode = SCRIPT_ALIAS_TO_CODE.get(candidate);
    if (aliasCode) {
      const wikidataScript = wikidataScriptByCode.get(aliasCode);
      const wwsEntry = wwsByCode.get(aliasCode);
      return {
        scriptCode: aliasCode,
        scriptName: wikidataScript?.label || wwsEntry?.name || aliasCode,
        scriptWikipediaUrl: wwsEntry?.wikipediaLink || wikidataScript?.wikipediaUrl || '',
        scriptQid: wikidataScript?.qid ?? '',
        wwsMatched: Boolean(wwsEntry),
      };
    }

    const base = baseScriptByName.get(candidate);
    if (base) {
      const wwsEntry = wwsByCode.get(base.scriptCode) ?? wwsByName.get(candidate);
      const wikidataScript = wikidataScriptByCode.get(base.scriptCode) ?? wikidataScriptByName.get(candidate);
      return {
        scriptCode: base.scriptCode,
        scriptName: base.scriptName,
        scriptWikipediaUrl: wwsEntry?.wikipediaLink || wikidataScript?.wikipediaUrl || '',
        scriptQid: wikidataScript?.qid ?? '',
        wwsMatched: Boolean(wwsEntry),
      };
    }

    const wwsEntry = wwsByName.get(candidate);
    if (wwsEntry?.iso15924) {
      const wikidataScript = wikidataScriptByCode.get(wwsEntry.iso15924) ?? wikidataScriptByName.get(candidate);
      return {
        scriptCode: wwsEntry.iso15924,
        scriptName: wikidataScript?.label || wwsEntry.name,
        scriptWikipediaUrl: wwsEntry.wikipediaLink || wikidataScript?.wikipediaUrl || '',
        scriptQid: wikidataScript?.qid ?? '',
        wwsMatched: true,
      };
    }

    const wikidataScript = wikidataScriptByName.get(candidate);
    if (wikidataScript) {
      const wwsByResolvedCode = wwsByCode.get(wikidataScript.scriptCode);
      return {
        scriptCode: wikidataScript.scriptCode,
        scriptName: wikidataScript.label,
        scriptWikipediaUrl: wwsByResolvedCode?.wikipediaLink || wikidataScript.wikipediaUrl || '',
        scriptQid: wikidataScript.qid,
        wwsMatched: Boolean(wwsByResolvedCode),
      };
    }
  }

  return null;
}

function resolveLanguage(languageName, context) {
  const { baseLanguageByName, wikidataLanguageByName } = context;
  const candidates = buildNameCandidates(languageName);

  for (const candidate of candidates) {
    const base = baseLanguageByName.get(candidate);
    if (base) return base;
  }

  for (const candidate of candidates) {
    const wikidataEntry = wikidataLanguageByName.get(candidate);
    if (wikidataEntry) return wikidataEntry;
  }

  return null;
}

function buildInitialBaseMaps(baseCatalog) {
  const baseLanguageByIso = new Map();
  const baseLanguageByName = new Map();
  const baseScriptByName = new Map();
  const baseScriptByCode = new Map();

  baseCatalog.languages.forEach((language) => {
    const iso6393 = String(language.iso6393 ?? '').trim().toLowerCase();
    if (!iso6393) return;

    const normalized = {
      rank: Number(language.rank) || 0,
      qid: String(language.qid ?? ''),
      iso6393,
      iso6391: String(language.iso6391 ?? '').trim().toLowerCase(),
      glottocode: String(language.glottocode ?? ''),
      glottocodes: Array.isArray(language.glottocodes) ? language.glottocodes : [],
      languageLabel: String(language.languageLabel ?? iso6393),
      sitelinks: Number(language.sitelinks) || 0,
      wikidataScriptCodes: Array.isArray(language.wikidataScriptCodes) ? language.wikidataScriptCodes.filter((code) => /^[A-Z][a-z]{3}$/.test(code)) : [],
      defaultScript: String(language.defaultScript ?? ''),
      defaultScriptName: String(language.defaultScriptName ?? ''),
      orthographySeeds: Array.isArray(language.orthographySeeds) ? language.orthographySeeds.map((seed) => ({ ...seed })) : [],
      wikipediaLanguageUrl: String(language.wikipediaLanguageUrl ?? ''),
    };

    baseLanguageByIso.set(iso6393, normalized);
    buildNameCandidates(normalized.languageLabel).forEach((candidate) => {
      if (!baseLanguageByName.has(candidate)) {
        baseLanguageByName.set(candidate, normalized);
      }
    });

    normalized.orthographySeeds.forEach((seed) => {
      const scriptCode = String(seed.scriptCode ?? '').trim();
      const scriptName = String(seed.scriptName ?? '').trim();
      if (/^[A-Z][a-z]{3}$/.test(scriptCode)) {
        baseScriptByCode.set(scriptCode, {
          scriptCode,
          scriptName: scriptName || scriptCode,
        });
      }
      buildScriptCandidates(scriptName).forEach((candidate) => {
        if (scriptCode) {
          baseScriptByName.set(candidate, {
            scriptCode,
            scriptName: scriptName || scriptCode,
          });
        }
      });
    });
  });

  return {
    baseLanguageByIso,
    baseLanguageByName,
    baseScriptByName,
    baseScriptByCode,
  };
}

function ensureLanguageEntry(languageByIso, baseTemplate, languageIso6393, defaultLabel) {
  if (!languageByIso.has(languageIso6393)) {
    languageByIso.set(languageIso6393, {
      rank: 0,
      qid: '',
      iso6393: languageIso6393,
      iso6391: '',
      glottocode: '',
      glottocodes: [],
      languageLabel: defaultLabel || languageIso6393,
      sitelinks: 0,
      wikidataScriptCodes: [],
      defaultScript: '',
      defaultScriptName: '',
      orthographySeeds: [],
      wikipediaLanguageUrl: '',
    });
  }

  const entry = languageByIso.get(languageIso6393);
  if (baseTemplate) {
    if (!entry.qid && baseTemplate.qid) entry.qid = baseTemplate.qid;
    if (!entry.iso6391 && baseTemplate.iso6391) entry.iso6391 = baseTemplate.iso6391;
    if (!entry.glottocode && baseTemplate.glottocode) entry.glottocode = baseTemplate.glottocode;
    if ((!entry.glottocodes || entry.glottocodes.length === 0) && Array.isArray(baseTemplate.glottocodes)) entry.glottocodes = baseTemplate.glottocodes;
    if ((!entry.languageLabel || entry.languageLabel === entry.iso6393) && baseTemplate.languageLabel) entry.languageLabel = baseTemplate.languageLabel;
    if ((!entry.sitelinks || entry.sitelinks === 0) && baseTemplate.sitelinks) entry.sitelinks = baseTemplate.sitelinks;
    if ((!entry.wikidataScriptCodes || entry.wikidataScriptCodes.length === 0) && Array.isArray(baseTemplate.wikidataScriptCodes)) entry.wikidataScriptCodes = baseTemplate.wikidataScriptCodes;
    if (!entry.wikipediaLanguageUrl && baseTemplate.wikipediaUrl) entry.wikipediaLanguageUrl = baseTemplate.wikipediaUrl;
  }

  return entry;
}

function mergeOrthographySeed(languageEntry, seed) {
  const existing = languageEntry.orthographySeeds.find((item) => item.scriptCode === seed.scriptCode);
  if (!existing) {
    languageEntry.orthographySeeds.push(seed);
    return;
  }

  if (existing.source === 'cldr-default' && seed.source !== 'cldr-default') {
    existing.source = seed.source;
  }

  if (existing.priority !== 'primary' && seed.priority === 'primary') {
    existing.priority = 'primary';
  }

  if (!existing.wikipediaScriptUrl && seed.wikipediaScriptUrl) {
    existing.wikipediaScriptUrl = seed.wikipediaScriptUrl;
  }

  if (!existing.scriptQid && seed.scriptQid) {
    existing.scriptQid = seed.scriptQid;
  }

  const evidence = Array.isArray(existing.evidenceSources) ? existing.evidenceSources : [];
  seed.evidenceSources.forEach((entry) => {
    if (!evidence.includes(entry)) evidence.push(entry);
  });
  existing.evidenceSources = evidence;

  if (existing.verificationStatus !== 'verified-by-wikidata' && seed.verificationStatus === 'verified-by-wikidata') {
    existing.verificationStatus = 'verified-by-wikidata';
  }
}

function inferDirection(scriptCode) {
  return RTL_SCRIPTS.has(scriptCode) ? 'rtl' : 'ltr';
}

function finalizeLanguageEntries(languageByIso, wikidataLanguageByIso) {
  const entries = Array.from(languageByIso.values()).filter((entry) => entry.orthographySeeds.length > 0);
  const maxExistingRank = entries.reduce((max, entry) => Math.max(max, Number(entry.rank) || 0), 0);

  const rankedExisting = entries
    .filter((entry) => Number(entry.rank) > 0)
    .sort((a, b) => Number(a.rank) - Number(b.rank));

  const newEntries = entries
    .filter((entry) => !Number(entry.rank) || Number(entry.rank) <= 0)
    .sort((a, b) => {
      const sitelinkDelta = (Number(b.sitelinks) || 0) - (Number(a.sitelinks) || 0);
      if (sitelinkDelta !== 0) return sitelinkDelta;
      return a.languageLabel.localeCompare(b.languageLabel, 'en');
    });

  newEntries.forEach((entry, index) => {
    entry.rank = maxExistingRank + index + 1;
  });

  const all = [...rankedExisting, ...newEntries].sort((a, b) => Number(a.rank) - Number(b.rank));

  all.forEach((entry) => {
    entry.orthographySeeds.sort((a, b) => {
      if (a.priority === b.priority) return a.scriptCode.localeCompare(b.scriptCode);
      return a.priority === 'primary' ? -1 : 1;
    });

    const primary = entry.orthographySeeds.find((seed) => seed.priority === 'primary') ?? entry.orthographySeeds[0];
    if (!entry.defaultScript && primary) {
      entry.defaultScript = primary.scriptCode;
    }
    if (!entry.defaultScriptName && primary) {
      entry.defaultScriptName = primary.scriptName;
    }

    if (!entry.wikidataScriptCodes || entry.wikidataScriptCodes.length === 0) {
      const wd = wikidataLanguageByIso.get(entry.iso6393);
      if (wd?.wikidataScriptCodes?.length) {
        entry.wikidataScriptCodes = wd.wikidataScriptCodes;
      }
    }

    entry.orthographySeeds = entry.orthographySeeds.map((seed, idx) => ({
      id: `${entry.iso6393}-${seed.scriptCode.toLowerCase()}`,
      labelEn: `${entry.languageLabel} (${seed.scriptName || seed.scriptCode})`,
      scriptCode: seed.scriptCode,
      scriptName: seed.scriptName || SCRIPT_DISPLAY.of(seed.scriptCode) || seed.scriptCode,
      priority: idx === 0 ? 'primary' : seed.priority,
      source: seed.source,
      reviewStatus: seed.reviewStatus ?? 'needs-review',
      seedKind: seed.seedKind ?? 'script-derived',
      direction: seed.direction ?? inferDirection(seed.scriptCode),
      wikipediaScriptUrl: seed.wikipediaScriptUrl ?? '',
      scriptQid: seed.scriptQid ?? '',
      verificationStatus: seed.verificationStatus ?? 'needs-review',
      evidenceSources: Array.isArray(seed.evidenceSources) ? seed.evidenceSources : [],
    }));
  });

  return all;
}

async function main() {
  let inputPath = process.env.BASE_SEED_PATH || '';
  if (!inputPath) {
    try {
      await stat(BASELINE_JSON);
      inputPath = BASELINE_JSON;
    } catch {
      inputPath = OUTPUT_JSON;
    }
  }

  const raw = await readFile(inputPath, 'utf8');
  const baseCatalog = JSON.parse(raw);

  const [omniglotHtml, wwsHtml, wikidataScriptCatalog, wikidataLanguageCatalog] = await Promise.all([
    fetchText(OMNIGLOT_LANGALPH_URL),
    fetchText(WWS_INDEX_URL),
    loadWikidataScriptCatalog(),
    loadWikidataLanguageCatalog(),
  ]);

  const omniglotRows = parseOmniglotLangalph(omniglotHtml);
  const wwsCatalog = parseWwsCatalog(wwsHtml);

  const {
    baseLanguageByIso,
    baseLanguageByName,
    baseScriptByName,
    baseScriptByCode,
  } = buildInitialBaseMaps(baseCatalog);

  const languageByIso = new Map(baseLanguageByIso);

  const unresolvedLanguages = new Map();
  const unresolvedScripts = new Map();
  const omniglotScriptCodes = new Set();

  const scriptResolveContext = {
    baseScriptByName,
    wwsByName: wwsCatalog.byName,
    wwsByCode: wwsCatalog.byCode,
    wikidataScriptByName: wikidataScriptCatalog.byName,
    wikidataScriptByCode: wikidataScriptCatalog.byCode,
  };

  const languageResolveContext = {
    baseLanguageByName,
    wikidataLanguageByName: wikidataLanguageCatalog.byName,
  };

  for (const row of omniglotRows) {
    const resolvedScript = resolveScript(row.scriptName, scriptResolveContext);
    if (!resolvedScript) {
      const key = row.scriptName;
      unresolvedScripts.set(key, (unresolvedScripts.get(key) ?? 0) + 1);
      continue;
    }

    omniglotScriptCodes.add(resolvedScript.scriptCode);

    for (const languageItem of row.languages) {
      const resolvedLanguage = resolveLanguage(languageItem.name, languageResolveContext);
      if (!resolvedLanguage?.iso6393) {
        unresolvedLanguages.set(languageItem.name, (unresolvedLanguages.get(languageItem.name) ?? 0) + 1);
        continue;
      }

      const languageEntry = ensureLanguageEntry(
        languageByIso,
        resolvedLanguage,
        resolvedLanguage.iso6393,
        resolvedLanguage.languageLabel || languageItem.name,
      );

      if (!languageEntry.wikipediaLanguageUrl && resolvedLanguage.wikipediaUrl) {
        languageEntry.wikipediaLanguageUrl = resolvedLanguage.wikipediaUrl;
      }

      const wikidataScripts = new Set(languageEntry.wikidataScriptCodes ?? []);
      const verifiedByWikidata = wikidataScripts.has(resolvedScript.scriptCode);
      const wwsEntry = wwsCatalog.byCode.get(resolvedScript.scriptCode);

      const sourceParts = ['omniglot-langalph'];
      if (resolvedScript.wwsMatched || wwsEntry) sourceParts.push('wws');
      if (verifiedByWikidata) sourceParts.push('wikidata');

      const seed = {
        id: `${languageEntry.iso6393}-${resolvedScript.scriptCode.toLowerCase()}`,
        labelEn: `${languageEntry.languageLabel} (${resolvedScript.scriptName || resolvedScript.scriptCode})`,
        scriptCode: resolvedScript.scriptCode,
        scriptName: resolvedScript.scriptName || SCRIPT_DISPLAY.of(resolvedScript.scriptCode) || resolvedScript.scriptCode,
        priority: languageEntry.orthographySeeds.length === 0 ? 'primary' : 'secondary',
        source: sourceParts.join('+'),
        reviewStatus: verifiedByWikidata ? 'verified-primary' : 'needs-review',
        seedKind: verifiedByWikidata ? 'cross-verified' : 'script-derived',
        direction: inferDirection(resolvedScript.scriptCode),
        wikipediaScriptUrl: resolvedScript.scriptWikipediaUrl || wwsEntry?.wikipediaLink || '',
        scriptQid: resolvedScript.scriptQid,
        verificationStatus: verifiedByWikidata ? 'verified-by-wikidata' : 'pending-manual-review',
        evidenceSources: ['omniglot-langalph', ...(resolvedScript.wwsMatched ? ['worldswritingsystems'] : []), ...(verifiedByWikidata ? ['wikidata-p282'] : [])],
      };

      mergeOrthographySeed(languageEntry, seed);

      if (!languageEntry.defaultScript) {
        languageEntry.defaultScript = seed.scriptCode;
        languageEntry.defaultScriptName = seed.scriptName;
      }
    }
  }

  const languages = finalizeLanguageEntries(languageByIso, wikidataLanguageCatalog.byIso6393);

  const wwsScriptCodes = new Set(Array.from(wwsCatalog.byCode.keys()));
  const baseLanguageCount = Array.isArray(baseCatalog.languages) ? baseCatalog.languages.length : 0;
  const expandedLanguageCount = languages.length;

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
      'verificationStatus',
      'languageWikipediaUrl',
      'scriptWikipediaUrl',
      'evidenceSources',
    ].join(','),
  ];

  languages.forEach((language) => {
    language.orthographySeeds.forEach((seed) => {
      csvRows.push([
        language.rank,
        language.iso6393,
        language.iso6391,
        language.glottocode,
        language.qid,
        language.languageLabel,
        language.sitelinks,
        language.defaultScript,
        language.defaultScriptName,
        seed.id,
        seed.labelEn,
        seed.scriptCode,
        seed.scriptName,
        seed.priority,
        seed.source,
        seed.reviewStatus,
        seed.seedKind,
        seed.verificationStatus,
        language.wikipediaLanguageUrl ?? '',
        seed.wikipediaScriptUrl ?? '',
        (seed.evidenceSources ?? []).join('|'),
      ].map(toCsvValue).join(','));
    });
  });

  const unresolvedLanguageItems = Array.from(unresolvedLanguages.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1000)
    .map(([name, occurrences]) => ({ name, occurrences }));

  const unresolvedScriptItems = Array.from(unresolvedScripts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([scriptName, occurrences]) => ({ scriptName, occurrences }));

  const payload = {
    generatedAt: new Date().toISOString(),
    limit: expandedLanguageCount,
    methodology: {
      rankingSource: 'Wikidata sitelinks proxy (base) + Omniglot script-language expansion',
      scriptSource: 'Unicode CLDR likelySubtags + Wikidata P282/P506 + Omniglot langalph + World Writing Systems',
      languageNormalization: 'ISO 639-3 + ISO 639-1 + Wikidata language entity mapping',
      note: 'Orthography seeds are automatically expanded from Omniglot and WWS, then cross-checked with Wikidata and Wikipedia links. Manual review is still required for unresolved or conflicting cases.',
    },
    sources: [
      'https://www.wikidata.org/wiki/Wikidata:Data_access',
      'https://query.wikidata.org/',
      'https://cldr.unicode.org/',
      'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/likelySubtags.json',
      'https://www.omniglot.com/writing/langalph.htm',
      'https://www.omniglot.com/sitemap.htm',
      'https://www.worldswritingsystems.org/index.php',
    ],
    baseLanguageCount,
    expandedLanguageCount,
    addedLanguageCount: Math.max(0, expandedLanguageCount - baseLanguageCount),
    languages,
  };

  const report = {
    generatedAt: payload.generatedAt,
    baseLanguageCount,
    expandedLanguageCount,
    addedLanguageCount: Math.max(0, expandedLanguageCount - baseLanguageCount),
    omniglotScriptRowCount: omniglotRows.length,
    wwsScriptCount: wwsCatalog.scripts.length,
    resolvedOmniglotScriptCodeCount: omniglotScriptCodes.size,
    unresolvedOmniglotLanguageCount: unresolvedLanguages.size,
    unresolvedOmniglotScriptCount: unresolvedScripts.size,
    scriptsInWwsNotInOmniglotResolved: Array.from(wwsScriptCodes).filter((code) => !omniglotScriptCodes.has(code)).sort(),
    scriptsInOmniglotNotInWwsResolved: Array.from(omniglotScriptCodes).filter((code) => !wwsScriptCodes.has(code)).sort(),
    unresolvedLanguages: unresolvedLanguageItems,
    unresolvedScripts: unresolvedScriptItems,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(OUTPUT_CSV, `${csvRows.join('\n')}\n`, 'utf8');
  await writeFile(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Expanded language seeds: ${expandedLanguageCount} (base ${baseLanguageCount})`);
  console.log(`Base input: ${inputPath}`);
  console.log(`Unresolved languages from Omniglot: ${unresolvedLanguages.size}`);
  console.log(`Unresolved scripts from Omniglot: ${unresolvedScripts.size}`);
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`CSV: ${OUTPUT_CSV}`);
  console.log(`Report: ${OUTPUT_REPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
