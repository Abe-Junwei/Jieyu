import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/language-support');
const INPUT_MAIN = path.join(OUTPUT_DIR, 'top500-language-orthography-seeds.json');
const OUTPUT_MAIN = INPUT_MAIN;
const OUTPUT_REPORT = path.join(OUTPUT_DIR, 'orthography-converge-main-report.json');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function hasMappingDecision(language, fromIso, toIso) {
  return asArray(language.mappingDecisions).some((decision) => (
    toLower(decision.fromIso6393) === toLower(fromIso)
    && toLower(decision.toIso6393) === toLower(toIso)
  ));
}

function mergeMyqSeedsIntoMnk(mnkLanguage, myqLanguage) {
  const byScript = new Map(
    asArray(mnkLanguage.orthographySeeds).map((seed) => [toLower(seed.scriptCode), { ...seed }]),
  );

  asArray(myqLanguage.orthographySeeds).forEach((seed) => {
    const scriptKey = toLower(seed.scriptCode);
    if (!byScript.has(scriptKey)) {
      byScript.set(scriptKey, {
        ...seed,
        id: `${mnkLanguage.iso6393}-${scriptKey}`,
        labelEn: `${mnkLanguage.languageLabel} (${seed.scriptName})`,
        source: `${seed.source}+retired-myq-main-converge`,
        reviewStatus: 'needs-review',
        verificationStatus: seed.verificationStatus ?? 'needs-review',
      });
    }
  });

  const mergedSeeds = Array.from(byScript.values());
  mnkLanguage.orthographySeeds = mergedSeeds.map((seed, index) => ({
    ...seed,
    priority: index === 0 ? 'primary' : (seed.priority === 'primary' ? 'secondary' : seed.priority),
  }));
}

async function main() {
  const raw = await readFile(INPUT_MAIN, 'utf8');
  const payload = JSON.parse(raw);

  const languages = asArray(payload.languages).map((language) => ({
    ...language,
    iso6393: toLower(language.iso6393),
    iso6391: toLower(language.iso6391),
    orthographySeeds: asArray(language.orthographySeeds).map((seed) => ({ ...seed })),
  }));

  const byIso = new Map(languages.map((language) => [language.iso6393, language]));
  const mnk = byIso.get('mnk');
  const myq = byIso.get('myq');

  if (!mnk) {
    throw new Error('Converge failed: mnk not found in main seeds.');
  }

  const actions = [];

  // 主数据收敛: 将退休码 myq 并入 mnk | Main convergence: merge retired code myq into mnk
  if (myq) {
    mergeMyqSeedsIntoMnk(mnk, myq);
    byIso.delete('myq');
    actions.push({
      action: 'merge-retired-main',
      fromIso6393: 'myq',
      toIso6393: 'mnk',
      detail: 'Removed myq entry from main seeds and merged unique seeds into mnk.',
    });
  } else {
    actions.push({
      action: 'already-converged',
      fromIso6393: 'myq',
      toIso6393: 'mnk',
      detail: 'No myq entry found in main seeds; convergence already applied.',
    });
  }

  const aliasSet = new Set(asArray(mnk.legacyCodeAliases).map((value) => toLower(value)));
  aliasSet.add('myq');
  mnk.legacyCodeAliases = Array.from(aliasSet).sort();

  if (!hasMappingDecision(mnk, 'myq', 'mnk')) {
    const decisions = asArray(mnk.mappingDecisions).map((decision) => ({ ...decision }));
    decisions.push({
      fromIso6393: 'myq',
      toIso6393: 'mnk',
      decision: 'map-to-mnk',
      rationale: 'main seeds convergence for retired Forest Maninka code',
      generatedAt: new Date().toISOString(),
      source: 'orthography-main-converge-policy',
    });
    mnk.mappingDecisions = decisions;
  }

  const convergedLanguages = Array.from(byIso.values())
    .sort((left, right) => Number(left.rank || 0) - Number(right.rank || 0))
    .map((language, index) => ({
      ...language,
      rank: index + 1,
      orthographySeeds: asArray(language.orthographySeeds).map((seed, seedIndex) => ({
        ...seed,
        id: `${language.iso6393}-${toLower(seed.scriptCode)}`,
        priority: seedIndex === 0 ? 'primary' : (seed.priority === 'primary' ? 'secondary' : seed.priority),
      })),
    }));

  const outputPayload = {
    ...payload,
    generatedAt: new Date().toISOString(),
    languages: convergedLanguages,
    convergence: {
      policy: 'main-map-retired-myq-to-mnk',
      actions,
    },
  };

  const report = {
    generatedAt: outputPayload.generatedAt,
    inputMain: INPUT_MAIN,
    outputMain: OUTPUT_MAIN,
    actions,
    metrics: {
      languageCount: convergedLanguages.length,
      myqPresent: convergedLanguages.some((language) => language.iso6393 === 'myq'),
      mnkPresent: convergedLanguages.some((language) => language.iso6393 === 'mnk'),
      mnkLegacyAliases: asArray(mnk.legacyCodeAliases),
      mnkScripts: asArray(mnk.orthographySeeds).map((seed) => seed.scriptCode),
    },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(OUTPUT_MAIN, `${JSON.stringify(outputPayload, null, 2)}\n`, 'utf8'),
    writeFile(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
  ]);

  console.log(`Converged main seeds: ${OUTPUT_MAIN}`);
  console.log(`Converge report: ${OUTPUT_REPORT}`);
  console.log(`Languages after convergence: ${convergedLanguages.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
