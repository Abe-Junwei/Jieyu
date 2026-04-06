import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/language-support');
const INPUT_JSON = process.env.LANGUAGE_SEEDS_INPUT
  ? path.resolve(process.cwd(), process.env.LANGUAGE_SEEDS_INPUT)
  : path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.json');
const OUTPUT_REPORT = process.env.LANGUAGE_SEEDS_VALIDATION_REPORT
  ? path.resolve(process.cwd(), process.env.LANGUAGE_SEEDS_VALIDATION_REPORT)
  : path.join(OUTPUT_DIR, 'orthography-independent-validation-report.json');

const SOURCES = {
  iso6393: 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab',
  iso6393Retirements: 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3_Retirements.tab',
  iso15924: 'https://www.unicode.org/iso15924/iso15924.txt',
  cldrLikelySubtags: 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/likelySubtags.json',
  ianaRegistry: 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
};

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: '*/*',
      'User-Agent': 'GitHubCopilot/1.0 (Jieyu independent validation)',
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return await response.text();
}

function parseIso639_3(tabText) {
  const lines = tabText.split(/\r?\n/).filter(Boolean);
  const activeCodes = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split('\t');
    const id = String(cols[0] ?? '').trim().toLowerCase();
    if (id) activeCodes.add(id);
  }
  return activeCodes;
}

function parseIso639_3Retirements(tabText) {
  const lines = tabText.split(/\r?\n/).filter(Boolean);
  const byCode = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split('\t');
    const id = String(cols[0] ?? '').trim().toLowerCase();
    if (!id) continue;
    byCode.set(id, {
      id,
      refName: String(cols[1] ?? '').trim(),
      reason: String(cols[2] ?? '').trim(),
      changeTo: String(cols[3] ?? '').trim().toLowerCase(),
      retireDate: String(cols[4] ?? '').trim(),
    });
  }
  return byCode;
}

function parseIso15924(text) {
  const scriptCodes = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const code = String(line.split(';')[0] ?? '').trim();
    if (/^[A-Z][a-z]{3}$/.test(code)) scriptCodes.add(code);
  }
  return scriptCodes;
}

function parseCldrLikelySubtags(text) {
  const json = JSON.parse(text);
  const likelySubtags = json?.supplemental?.likelySubtags ?? {};
  const byIso6393 = new Map();
  for (const [lang, tag] of Object.entries(likelySubtags)) {
    const language = String(lang ?? '').toLowerCase();
    const match = String(tag).match(/^[a-z]{2,3}[_-]([A-Z][a-z]{3})[_-]/);
    if (!match) continue;
    const script = match[1];
    if (!byIso6393.has(language)) byIso6393.set(language, script);
  }
  return byIso6393;
}

function parseIanaSuppressScript(registryText) {
  const blocks = registryText.split('%%');
  const suppressScriptByLanguage = new Map();

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let type = '';
    let subtag = '';
    let suppressScript = '';

    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key === 'Type') type = value;
      if (key === 'Subtag') subtag = value.toLowerCase();
      if (key === 'Suppress-Script') suppressScript = value;
    }

    if (type === 'language' && subtag && /^[A-Z][a-z]{3}$/.test(suppressScript)) {
      suppressScriptByLanguage.set(subtag, suppressScript);
    }
  }

  return suppressScriptByLanguage;
}

function summarizeMatches(items, maxItems = 30) {
  return items.slice(0, maxItems);
}

async function main() {
  const inputRaw = await readFile(INPUT_JSON, 'utf8');
  const catalog = JSON.parse(inputRaw);

  const [iso6393Tab, iso6393RetirementsTab, iso15924Text, cldrLikelySubtagsText, ianaRegistryText] = await Promise.all([
    fetchText(SOURCES.iso6393),
    fetchText(SOURCES.iso6393Retirements),
    fetchText(SOURCES.iso15924),
    fetchText(SOURCES.cldrLikelySubtags),
    fetchText(SOURCES.ianaRegistry),
  ]);

  const activeIso6393 = parseIso639_3(iso6393Tab);
  const retiredIso6393 = parseIso639_3Retirements(iso6393RetirementsTab);
  const iso15924 = parseIso15924(iso15924Text);
  const cldrByLanguage = parseCldrLikelySubtags(cldrLikelySubtagsText);
  const ianaSuppressScriptByLanguage = parseIanaSuppressScript(ianaRegistryText);

  const invalidIso6393 = [];
  const retiredIso6393InCatalog = [];
  const invalidScriptCodes = [];
  const cldrMismatches = [];
  const ianaSuppressScriptMismatches = [];

  let cldrComparableCount = 0;
  let cldrAgreementCount = 0;
  let ianaComparableCount = 0;
  let ianaAgreementCount = 0;

  const languages = Array.isArray(catalog.languages) ? catalog.languages : [];

  for (const language of languages) {
    const iso6393 = String(language.iso6393 ?? '').trim().toLowerCase();
    const seeds = Array.isArray(language.orthographySeeds) ? language.orthographySeeds : [];
    const scriptCodes = Array.from(new Set(seeds.map((seed) => String(seed.scriptCode ?? '').trim()).filter(Boolean)));

    if (iso6393) {
      if (!activeIso6393.has(iso6393)) {
        invalidIso6393.push({
          iso6393,
          languageLabel: String(language.languageLabel ?? ''),
          rank: Number(language.rank ?? 0),
        });
      }

      const retired = retiredIso6393.get(iso6393);
      if (retired) {
        retiredIso6393InCatalog.push({
          iso6393,
          languageLabel: String(language.languageLabel ?? ''),
          rank: Number(language.rank ?? 0),
          retirement: retired,
        });
      }

      const cldrScript = cldrByLanguage.get(iso6393);
      if (cldrScript) {
        cldrComparableCount += 1;
        if (scriptCodes.includes(cldrScript)) {
          cldrAgreementCount += 1;
        } else {
          cldrMismatches.push({
            iso6393,
            languageLabel: String(language.languageLabel ?? ''),
            cldrLikelyScript: cldrScript,
            catalogScripts: scriptCodes,
          });
        }
      }

      const ianaSuppressScript = ianaSuppressScriptByLanguage.get(iso6393) || ianaSuppressScriptByLanguage.get(String(language.iso6391 ?? '').trim().toLowerCase());
      if (ianaSuppressScript) {
        ianaComparableCount += 1;
        if (scriptCodes.includes(ianaSuppressScript)) {
          ianaAgreementCount += 1;
        } else {
          ianaSuppressScriptMismatches.push({
            iso6393,
            iso6391: String(language.iso6391 ?? ''),
            languageLabel: String(language.languageLabel ?? ''),
            ianaSuppressScript,
            catalogScripts: scriptCodes,
          });
        }
      }
    }

    for (const scriptCode of scriptCodes) {
      if (!iso15924.has(scriptCode)) {
        invalidScriptCodes.push({
          iso6393,
          languageLabel: String(language.languageLabel ?? ''),
          scriptCode,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputFile: INPUT_JSON,
    sources: SOURCES,
    metrics: {
      totalLanguages: languages.length,
      invalidIso6393Count: invalidIso6393.length,
      retiredIso6393Count: retiredIso6393InCatalog.length,
      invalidScriptCodeCount: invalidScriptCodes.length,
      cldrComparableCount,
      cldrAgreementCount,
      cldrDisagreementCount: cldrComparableCount - cldrAgreementCount,
      cldrAgreementRate: cldrComparableCount > 0 ? cldrAgreementCount / cldrComparableCount : 0,
      ianaComparableCount,
      ianaAgreementCount,
      ianaDisagreementCount: ianaComparableCount - ianaAgreementCount,
      ianaAgreementRate: ianaComparableCount > 0 ? ianaAgreementCount / ianaComparableCount : 0,
    },
    invalidIso6393: summarizeMatches(invalidIso6393, 200),
    retiredIso6393InCatalog: summarizeMatches(retiredIso6393InCatalog, 200),
    invalidScriptCodes: summarizeMatches(invalidScriptCodes, 200),
    sampleCldrMismatches: summarizeMatches(cldrMismatches, 200),
    sampleIanaSuppressScriptMismatches: summarizeMatches(ianaSuppressScriptMismatches, 200),
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Independent validation report written: ${OUTPUT_REPORT}`);
  console.log(`Total languages: ${languages.length}`);
  console.log(`Invalid ISO639-3: ${invalidIso6393.length}`);
  console.log(`Retired ISO639-3 in catalog: ${retiredIso6393InCatalog.length}`);
  console.log(`Invalid ISO15924 scripts: ${invalidScriptCodes.length}`);
  console.log(`CLDR agreement: ${cldrAgreementCount}/${cldrComparableCount}`);
  console.log(`IANA suppress-script agreement: ${ianaAgreementCount}/${ianaComparableCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
