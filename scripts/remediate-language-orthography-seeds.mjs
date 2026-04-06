import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/language-support');
const INPUT_SEEDS = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.json');
const INPUT_VALIDATION = path.join(OUTPUT_DIR, 'orthography-independent-validation-report.json');

const OUTPUT_SEEDS = INPUT_SEEDS;
const OUTPUT_REMEDIATION_REPORT = path.join(OUTPUT_DIR, 'orthography-remediation-report.json');
const OUTPUT_TRIAGE_REPORT = path.join(OUTPUT_DIR, 'orthography-cldr-triage-report.json');
const OUTPUT_WHITELIST_JSON = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.publish-whitelist.json');
const OUTPUT_WHITELIST_CSV = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.publish-whitelist.csv');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function dedupeBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
}

function csvValue(input) {
  const s = String(input ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function normalizeLanguage(language) {
  return {
    ...language,
    iso6393: toLower(language.iso6393),
    iso6391: toLower(language.iso6391),
    orthographySeeds: asArray(language.orthographySeeds).map((seed) => ({ ...seed })),
  };
}

function mergeLanguageEntries(target, source) {
  target.wikidataScriptCodes = dedupeBy(
    [...asArray(target.wikidataScriptCodes), ...asArray(source.wikidataScriptCodes)],
    (code) => String(code),
  );

  target.glottocodes = dedupeBy(
    [...asArray(target.glottocodes), ...asArray(source.glottocodes)],
    (code) => String(code),
  );

  const mergedSeeds = dedupeBy(
    [...asArray(target.orthographySeeds), ...asArray(source.orthographySeeds)].map((seed) => ({ ...seed })),
    (seed) => toLower(seed.scriptCode),
  );

  target.orthographySeeds = mergedSeeds.map((seed, index) => ({
    ...seed,
    id: `${target.iso6393}-${toLower(seed.scriptCode)}`,
    labelEn: `${target.languageLabel} (${seed.scriptName})`,
    priority: index === 0 ? 'primary' : (seed.priority === 'primary' ? 'secondary' : seed.priority),
  }));

  if (!target.wikipediaLanguageUrl && source.wikipediaLanguageUrl) {
    target.wikipediaLanguageUrl = source.wikipediaLanguageUrl;
  }

  if (!target.qid && source.qid) {
    target.qid = source.qid;
  }

  if (!target.glottocode && source.glottocode) {
    target.glottocode = source.glottocode;
  }

  if (!target.languageLabel && source.languageLabel) {
    target.languageLabel = source.languageLabel;
  }

  if (!target.defaultScript && source.defaultScript) {
    target.defaultScript = source.defaultScript;
  }

  if (!target.defaultScriptName && source.defaultScriptName) {
    target.defaultScriptName = source.defaultScriptName;
  }

  target.sitelinks = Math.max(Number(target.sitelinks || 0), Number(source.sitelinks || 0));
}

function classifyCldrMismatch(mismatch, languageEntry) {
  const scripts = new Set((mismatch.catalogScripts || []).map((s) => String(s)));
  const seeds = asArray(languageEntry?.orthographySeeds);
  const hasWikidataVerification = seeds.some((seed) => String(seed.verificationStatus) === 'verified-by-wikidata');
  const hasMultiScripts = scripts.size > 1;

  if (hasWikidataVerification || hasMultiScripts) {
    return {
      category: 'accepted-variant',
      reason: hasWikidataVerification
        ? 'catalog script has wikidata verification evidence'
        : 'language keeps multiple orthography scripts and should stay multi-script',
    };
  }

  return {
    category: 'candidate-correction',
    reason: 'single non-CLDR script without wikidata verification, keep for manual correction queue',
  };
}

function toWhitelistCsv(languages) {
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
    ].join(','),
  ];

  languages.forEach((language) => {
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
      ].map(csvValue).join(','));
    });
  });

  return `${rows.join('\n')}\n`;
}

async function main() {
  const [seedText, validationText] = await Promise.all([
    readFile(INPUT_SEEDS, 'utf8'),
    readFile(INPUT_VALIDATION, 'utf8'),
  ]);

  const seeds = JSON.parse(seedText);
  const validation = JSON.parse(validationText);

  const originalLanguages = asArray(seeds.languages).map(normalizeLanguage);
  const byIso = new Map(originalLanguages.map((lang) => [lang.iso6393, lang]));

  const retiredByIso = new Map(
    asArray(validation.retiredIso6393InCatalog)
      .map((item) => ({ iso: toLower(item.iso6393), retirement: item.retirement, languageLabel: item.languageLabel }))
      .filter((item) => item.iso)
      .map((item) => [item.iso, item]),
  );

  const remediationActions = [];

  const prv = byIso.get('prv');
  const oci = byIso.get('oci');
  if (prv) {
    if (oci) {
      mergeLanguageEntries(oci, prv);
      const aliases = new Set(asArray(oci.retiredIso6393Aliases).map((v) => String(v).toLowerCase()));
      aliases.add('prv');
      oci.retiredIso6393Aliases = Array.from(aliases).sort();
      byIso.delete('prv');
      remediationActions.push({
        action: 'merge-retired-into-target',
        from: 'prv',
        to: 'oci',
        detail: 'retired code prv merged into active oci entry',
      });
    } else {
      prv.iso6393 = 'oci';
      prv.iso6391 = prv.iso6391 || 'oc';
      prv.languageLabel = 'Occitan';
      prv.orthographySeeds = asArray(prv.orthographySeeds).map((seed) => ({
        ...seed,
        id: `oci-${toLower(seed.scriptCode)}`,
        labelEn: `Occitan (${seed.scriptName})`,
      }));
      byIso.delete('prv');
      byIso.set('oci', prv);
      remediationActions.push({
        action: 'rename-retired-code',
        from: 'prv',
        to: 'oci',
        detail: 'retired code prv renamed to active code oci',
      });
    }
  }

  const myq = byIso.get('myq');
  if (myq) {
    myq.catalogStatus = 'retired-needs-manual-decision';
    myq.retirementInfo = retiredByIso.get('myq')?.retirement ?? {
      id: 'myq',
      refName: myq.languageLabel,
      reason: 'N',
      changeTo: '',
      retireDate: '',
    };
    myq.manualDecision = {
      required: true,
      suggestedOptions: ['map-to-mnk', 'map-to-mku', 'map-to-msc', 'keep-as-legacy-alias'],
      note: 'SIL retirement record has no direct replacement; manual linguistic decision required.',
    };

    myq.orthographySeeds = asArray(myq.orthographySeeds).map((seed) => ({
      ...seed,
      reviewStatus: 'retired-code-needs-review',
      verificationStatus: 'retired-code',
    }));

    remediationActions.push({
      action: 'flag-retired-no-replacement',
      from: 'myq',
      to: null,
      detail: 'myq kept as retired entry with manual decision placeholder',
    });
  }

  const remediatedLanguages = Array.from(byIso.values())
    .sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0))
    .map((language, index) => ({
      ...language,
      rank: index + 1,
      orthographySeeds: asArray(language.orthographySeeds).map((seed, seedIndex) => ({
        ...seed,
        id: `${language.iso6393}-${toLower(seed.scriptCode)}`,
        priority: seedIndex === 0 ? 'primary' : (seed.priority === 'primary' ? 'secondary' : seed.priority),
      })),
    }));

  const remediatedByIso = new Map(remediatedLanguages.map((language) => [language.iso6393, language]));

  const triageItems = asArray(validation.sampleCldrMismatches).map((mismatch) => {
    const iso = toLower(mismatch.iso6393);
    const languageEntry = remediatedByIso.get(iso);
    const classified = classifyCldrMismatch(mismatch, languageEntry);
    return {
      iso6393: iso,
      languageLabel: mismatch.languageLabel,
      cldrLikelyScript: mismatch.cldrLikelyScript,
      catalogScripts: asArray(mismatch.catalogScripts),
      category: classified.category,
      reason: classified.reason,
      hasWikidataVerification: asArray(languageEntry?.orthographySeeds).some((seed) => String(seed.verificationStatus) === 'verified-by-wikidata'),
      hasMultipleCatalogScripts: new Set(asArray(mismatch.catalogScripts)).size > 1,
      sources: asArray(languageEntry?.orthographySeeds).map((seed) => ({
        scriptCode: seed.scriptCode,
        source: seed.source,
        verificationStatus: seed.verificationStatus,
      })),
    };
  });

  const acceptedVariants = triageItems.filter((item) => item.category === 'accepted-variant');
  const correctionCandidates = triageItems.filter((item) => item.category === 'candidate-correction');
  const highRiskMismatchIsoSet = new Set(correctionCandidates.map((item) => item.iso6393));

  const retiredWithoutReplacementIsoSet = new Set(
    Array.from(retiredByIso.entries())
      .filter(([, item]) => !String(item.retirement?.changeTo || '').trim())
      .map(([iso]) => iso),
  );

  const whitelistLanguages = remediatedLanguages
    .filter((language) => !retiredWithoutReplacementIsoSet.has(language.iso6393))
    .filter((language) => !highRiskMismatchIsoSet.has(language.iso6393));

  const remediatedPayload = {
    ...seeds,
    generatedAt: new Date().toISOString(),
    languages: remediatedLanguages,
    remediation: {
      retiredCodePolicy: {
        mergeWithActiveReplacement: true,
        keepRetiredWithoutReplacementAsManualDecision: true,
      },
      actions: remediationActions,
    },
  };

  const remediationReport = {
    generatedAt: remediatedPayload.generatedAt,
    inputSeeds: INPUT_SEEDS,
    inputValidationReport: INPUT_VALIDATION,
    actions: remediationActions,
    metrics: {
      beforeLanguageCount: originalLanguages.length,
      afterLanguageCount: remediatedLanguages.length,
      retiredWithoutReplacementCount: retiredWithoutReplacementIsoSet.size,
      retiredWithoutReplacementIso6393: Array.from(retiredWithoutReplacementIsoSet).sort(),
    },
  };

  const triageReport = {
    generatedAt: remediatedPayload.generatedAt,
    sourceValidationReport: INPUT_VALIDATION,
    metrics: {
      mismatchCount: triageItems.length,
      acceptedVariantCount: acceptedVariants.length,
      correctionCandidateCount: correctionCandidates.length,
    },
    acceptedVariants,
    correctionCandidates,
  };

  const whitelistPayload = {
    generatedAt: remediatedPayload.generatedAt,
    sourceFile: OUTPUT_SEEDS,
    policy: {
      excludedRetiredWithoutReplacementIso6393: Array.from(retiredWithoutReplacementIsoSet).sort(),
      excludedHighRiskMismatchIso6393: Array.from(highRiskMismatchIsoSet).sort(),
      note: 'Whitelist excludes retired-without-replacement and high-risk CLDR mismatch candidates.',
    },
    languages: whitelistLanguages,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(OUTPUT_SEEDS, `${JSON.stringify(remediatedPayload, null, 2)}\n`, 'utf8'),
    writeFile(OUTPUT_REMEDIATION_REPORT, `${JSON.stringify(remediationReport, null, 2)}\n`, 'utf8'),
    writeFile(OUTPUT_TRIAGE_REPORT, `${JSON.stringify(triageReport, null, 2)}\n`, 'utf8'),
    writeFile(OUTPUT_WHITELIST_JSON, `${JSON.stringify(whitelistPayload, null, 2)}\n`, 'utf8'),
    writeFile(OUTPUT_WHITELIST_CSV, toWhitelistCsv(whitelistLanguages), 'utf8'),
  ]);

  console.log(`Remediated seeds written: ${OUTPUT_SEEDS}`);
  console.log(`Remediation report: ${OUTPUT_REMEDIATION_REPORT}`);
  console.log(`CLDR triage report: ${OUTPUT_TRIAGE_REPORT}`);
  console.log(`Publish whitelist JSON: ${OUTPUT_WHITELIST_JSON}`);
  console.log(`Publish whitelist CSV: ${OUTPUT_WHITELIST_CSV}`);
  console.log(`Languages: ${originalLanguages.length} -> ${remediatedLanguages.length}`);
  console.log(`Triage: accepted=${acceptedVariants.length}, candidates=${correctionCandidates.length}`);
  console.log(`Whitelist languages: ${whitelistLanguages.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
