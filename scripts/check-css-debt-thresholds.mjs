import fs from 'node:fs';
import path from 'node:path';
import * as csstree from 'css-tree';
import { collectDuplicateClassStats } from './css-duplicate-class-governance.mjs';
import { collectInlineStyleStats } from './css-inline-style-governance.mjs';
import { collectUnusedSelectorStats } from './css-unused-selector-governance.mjs';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const TESTS_DIR = path.join(ROOT, 'tests');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'css-debt-thresholds.json');

const args = new Set(process.argv.slice(2));
const strict = !args.has('--report-only') && !args.has('--no-strict');

function walkFiles(dirPath, matcher) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath, matcher));
      continue;
    }
    if (entry.isFile() && matcher(nextPath)) files.push(nextPath);
  }
  return files.sort();
}

function toPosix(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function shouldSkipSource(relPath) {
  return /\.(test|spec)\.[tj]sx?$/.test(relPath)
    || /[\\/]__tests__[\\/]/.test(relPath)
    || relPath.endsWith('.d.ts');
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`missing config: ${path.relative(ROOT, CONFIG_PATH)}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function collectDuplicateStats() {
  const { duplicates } = collectDuplicateClassStats({
    rootDir: ROOT,
    stylesDir: STYLES_DIR,
  });
  return {
    total: duplicates.length,
    duplicates: [...duplicates].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0])),
  };
}

function collectUnusedStats() {
  const { unused } = collectUnusedSelectorStats({
    rootDir: ROOT,
    stylesDir: STYLES_DIR,
    sourceRoots: [SRC_DIR, TESTS_DIR],
  });
  return { total: unused.length, unused };
}

function readMetricConfig(config, key) {
  const metric = config?.metrics?.[key];
  if (!metric || typeof metric.maxTotal !== 'number') {
    throw new Error(`missing metrics.${key}.maxTotal in ${path.relative(ROOT, CONFIG_PATH)}`);
  }
  return {
    maxTotal: metric.maxTotal,
    targetTotal: typeof metric.targetTotal === 'number' ? metric.targetTotal : undefined,
    warnAtTotal: typeof metric.warnAtTotal === 'number' ? metric.warnAtTotal : undefined,
  };
}

function printMetric(label, current, config, extras = []) {
  const segments = [`current=${current}`, `max=${config.maxTotal}`];
  if (config.targetTotal !== undefined) segments.push(`target=${config.targetTotal}`);
  if (config.warnAtTotal !== undefined) segments.push(`warnAt=${config.warnAtTotal}`);
  console.log(`[check-css-debt-thresholds] ${label}: ${segments.join(', ')}`);
  for (const extra of extras) console.log(`  - ${extra}`);
}

function main() {
  const config = loadConfig();
  const inlineStats = collectInlineStyleStats();
  const duplicateStats = collectDuplicateStats();
  const unusedStats = collectUnusedStats();
  const failures = [...inlineStats.whitelistFailures];

  const inlineConfig = readMetricConfig(config, 'inlineStyleOccurrences');
  const duplicateConfig = readMetricConfig(config, 'duplicateClassNames');
  const unusedConfig = readMetricConfig(config, 'unusedSelectors');

  printMetric(
    'inlineStyleOccurrences',
    inlineStats.effectiveTotal,
    inlineConfig,
    [
      `rawTotal=${inlineStats.rawTotal}`,
      `whitelistedTotal=${inlineStats.approvedTotal}`,
      ...inlineStats.effectiveFiles.slice(0, 6).map(([file, count]) => `${file}: ${count}`),
    ],
  );
  printMetric(
    'duplicateClassNames',
    duplicateStats.total,
    duplicateConfig,
    duplicateStats.duplicates.slice(0, 6).map(([className, files]) => `${className}: ${files.length} files`),
  );
  printMetric(
    'unusedSelectors',
    unusedStats.total,
    unusedConfig,
    unusedStats.unused.slice(0, 6),
  );

  if (inlineStats.effectiveTotal > inlineConfig.maxTotal) {
    failures.push(`inlineStyleOccurrences exceeded max: ${inlineStats.effectiveTotal} > ${inlineConfig.maxTotal}`);
  }
  if (duplicateStats.total > duplicateConfig.maxTotal) {
    failures.push(`duplicateClassNames exceeded max: ${duplicateStats.total} > ${duplicateConfig.maxTotal}`);
  }
  if (unusedStats.total > unusedConfig.maxTotal) {
    failures.push(`unusedSelectors exceeded max: ${unusedStats.total} > ${unusedConfig.maxTotal}`);
  }

  if (failures.length === 0) {
    console.log('[check-css-debt-thresholds] OK');
    return;
  }

  console.error(`[check-css-debt-thresholds] failed (${failures.length})`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  if (strict) process.exit(1);
}

main();