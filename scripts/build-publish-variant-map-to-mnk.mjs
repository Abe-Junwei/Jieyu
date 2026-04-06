import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/language-support');
const INPUT_MAIN = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.json');
const INPUT_WHITELIST = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.publish-whitelist.json');

const OUTPUT_VARIANT_JSON = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.publish-whitelist.map-to-mnk.json');
const OUTPUT_VARIANT_CSV = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.publish-whitelist.map-to-mnk.csv');
const OUTPUT_VARIANT_REPORT = path.join(OUTPUT_DIR, 'orthography-publish-variant-map-to-mnk-report.json');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function toCsvValue(value) {
  const raw = String(value ?? '');
  if (/[",\n]/.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function normalizeLanguage(language) {
  return {
    ...language,
    iso6393: toLower(language.iso6393),
    iso6391: toLower(language.iso6391),
    orthographySeeds: asArray(language.orthographySeeds).map((seed) => ({ ...seed })),
  };
}

function mergeSeeds(targetLanguage, sourceSeeds) {
  const byScript = new Map(
    asArray(targetLanguage.orthographySeeds).map((seed) => [toLower(seed.scriptCode), { ...seed }]),
  );

  asArray(sourceSeeds).forEach((seed) => {
    const key = toLower(seed.scriptCode);
    if (!byScript.has(key)) {
      byScript.set(key, {
        ...seed,
        id: `${targetLanguage.iso6393}-${toLower(seed.scriptCode)}`,
        labelEn: `${targetLanguage.languageLabel} (${seed.scriptName})`,
        source: `${seed.source}+retired-myq-map`,
        reviewStatus: 'needs-review',
      });
    }
  });

  targetLanguage.orthographySeeds = Array.from(byScript.values()).map((seed, index) => ({
    ...seed,
    priority: index === 0 ? 'primary' : (seed.priority === 'primary' ? 'secondary' : seed.priority),
  }));
}

function buildCsv(languages) {
  const rows = [
    [
      'rank',
      'iso6393',
      'iso6391',
      'languageLabel',
      'defaultScript',
      'defaultScriptName',
      'orthographyId',
      'orthographyScriptCode',
      'orthographyScriptName',
      'orthographyPriority',
      'orthographySource',
      'reviewStatus',
      'verificationStatus',
      'legacyCodeAliases',
    ].join(','),
  ];

  languages.forEach((language) => {
    const aliases = asArray(language.legacyCodeAliases).join('|');
    asArray(language.orthographySeeds).forEach((seed) => {
      rows.push([
        language.rank,
        language.iso6393,
        language.iso6391,
        language.languageLabel,
        language.defaultScript,
        language.defaultScriptName,
        seed.id,
        seed.scriptCode,
        seed.scriptName,
        seed.priority,
        seed.source,
        seed.reviewStatus,
        seed.verificationStatus,
        aliases,
      ].map(toCsvValue).join(','));
    });
  });

  return `${rows.join('\n')}\n`;
}

async function main() {
  const [mainRaw, whitelistRaw] = await Promise.all([
    readFile(INPUT_MAIN, 'utf8'),
    readFile(INPUT_WHITELIST, 'utf8'),
  ]);

  const mainSeeds = JSON.parse(mainRaw);
  const whitelist = JSON.parse(whitelistRaw);

  const mainLanguages = asArray(mainSeeds.languages).map(normalizeLanguage);
  const whitelistLanguages = asArray(whitelist.languages).map(normalizeLanguage);

  const myqFromMain = mainLanguages.find((language) => language.iso6393 === 'myq');
  const mnkInWhitelist = whitelistLanguages.find((language) => language.iso6393 === 'mnk');

  if (!mnkInWhitelist) {
    throw new Error('Cannot build map-to-mnk variant: mnk not found in whitelist seeds.');
  }

  // 退休码 myq 的正字法种子并入 mnk 并保留别名追溯 | Merge retired myq orthography seeds into mnk and keep alias traceability
  if (myqFromMain) {
    mergeSeeds(mnkInWhitelist, myqFromMain.orthographySeeds);
  }

  const aliasSet = new Set(asArray(mnkInWhitelist.legacyCodeAliases).map((value) => toLower(value)));
  aliasSet.add('myq');
  mnkInWhitelist.legacyCodeAliases = Array.from(aliasSet).sort();

  const mappingDecisions = asArray(mnkInWhitelist.mappingDecisions).map((decision) => ({ ...decision }));
  mappingDecisions.push({
    fromIso6393: 'myq',
    toIso6393: 'mnk',
    decision: 'map-to-mnk',
    rationale: 'publish variant default mapping for retired Forest Maninka code',
    generatedAt: new Date().toISOString(),
    source: 'orthography-retirement-remediation-policy',
  });
  mnkInWhitelist.mappingDecisions = mappingDecisions;

  const variantPayload = {
    ...whitelist,
    generatedAt: new Date().toISOString(),
    variant: {
      id: 'map-to-mnk',
      note: 'Publish variant applying retired myq -> mnk default mapping while keeping whitelist guardrails.',
    },
    languages: whitelistLanguages,
  };

  const variantReport = {
    generatedAt: variantPayload.generatedAt,
    inputMain: INPUT_MAIN,
    inputWhitelist: INPUT_WHITELIST,
    outputVariant: OUTPUT_VARIANT_JSON,
    mapping: {
      fromIso6393: 'myq',
      toIso6393: 'mnk',
      mergedScriptsFromMyq: asArray(myqFromMain?.orthographySeeds).map((seed) => seed.scriptCode),
      mnkScriptsAfterMerge: asArray(mnkInWhitelist.orthographySeeds).map((seed) => seed.scriptCode),
      mnkLegacyCodeAliases: asArray(mnkInWhitelist.legacyCodeAliases),
      myqFoundInMainSeeds: Boolean(myqFromMain),
    },
    metrics: {
      variantLanguageCount: whitelistLanguages.length,
      myqPresentInVariant: whitelistLanguages.some((language) => language.iso6393 === 'myq'),
      mnkPresentInVariant: whitelistLanguages.some((language) => language.iso6393 === 'mnk'),
    },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(OUTPUT_VARIANT_JSON, `${JSON.stringify(variantPayload, null, 2)}\n`, 'utf8'),
    writeFile(OUTPUT_VARIANT_CSV, buildCsv(whitelistLanguages), 'utf8'),
    writeFile(OUTPUT_VARIANT_REPORT, `${JSON.stringify(variantReport, null, 2)}\n`, 'utf8'),
  ]);

  console.log(`Publish variant JSON: ${OUTPUT_VARIANT_JSON}`);
  console.log(`Publish variant CSV: ${OUTPUT_VARIANT_CSV}`);
  console.log(`Publish variant report: ${OUTPUT_VARIANT_REPORT}`);
  console.log(`Variant languages: ${whitelistLanguages.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
