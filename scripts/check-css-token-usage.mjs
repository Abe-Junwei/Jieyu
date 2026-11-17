import fs from 'node:fs';
import path from 'node:path';
import * as csstree from 'css-tree';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-token-usage-baseline.json');

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has('--write-baseline');
const strict = !args.has('--no-strict');

const LINE_PATTERNS = [
  /#([0-9a-fA-F]{3,8})\b/g,
  /rgba?\(/g,
  /hsla?\(/g,
];
const ALLOW_RAW_COLOR_FILES = new Set([
  'src/styles/tokens.css',
  'src/styles/panels/settings-modal.css',
]);

// ADR-0109: no semantic info blue; freeze legacy --state-info-* usage (especially accent/surface properties) against regressions.
const STATE_INFO_TOKEN_RE = /--state-info-(?:solid|text|bg|bg-strong|border|border-strong)\b|--bg-info-tint\b/g;
const STATE_INFO_ACCENT_PROP_RE = /^(?:background(?:-color|-image)?|box-shadow|outline(?:-color)?|border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?(?:-color)?|accent-color)$/i;

function countRawColorMatches(line) {
  if (line.includes('data:image/')) return 0;

  let count = 0;
  for (const pattern of LINE_PATTERNS) {
    pattern.lastIndex = 0;
    count += (line.match(pattern) ?? []).length;
  }
  return count;
}

function countStateInfoDecls(content) {
  let allCount = 0;
  let accentCount = 0;
  const ast = csstree.parse(content, { parseValue: false });
  csstree.walk(ast, {
    visit: 'Declaration',
    enter(node) {
      const rawValue = node.value?.value ?? '';
      STATE_INFO_TOKEN_RE.lastIndex = 0;
      const matches = rawValue.match(STATE_INFO_TOKEN_RE);
      if (!matches || matches.length === 0) return;
      allCount += matches.length;
      if (STATE_INFO_ACCENT_PROP_RE.test(node.property)) {
        accentCount += matches.length;
      }
    },
  });
  return { allCount, accentCount };
}

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

function readSectionBaseline(section) {
  return {
    total: typeof section?.total === 'number' ? section.total : 0,
    files: section && typeof section.files === 'object' && section.files ? section.files : {},
  };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return {
      rawColors: { total: 0, files: {} },
      stateInfoAll: { total: 0, files: {} },
      stateInfoAccentProps: { total: 0, files: {} },
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return {
      rawColors: readSectionBaseline(parsed),
      stateInfoAll: readSectionBaseline(parsed?.stateInfoAll),
      stateInfoAccentProps: readSectionBaseline(parsed?.stateInfoAccentProps),
    };
  } catch {
    return {
      rawColors: { total: 0, files: {} },
      stateInfoAll: { total: 0, files: {} },
      stateInfoAccentProps: { total: 0, files: {} },
    };
  }
}

function writeBaselineFile(rawTotal, rawFiles, infoAllTotal, infoAllFiles, infoAccentTotal, infoAccentFiles) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: rawTotal,
    files: Object.fromEntries(rawFiles),
    stateInfoAll: {
      total: infoAllTotal,
      files: Object.fromEntries(infoAllFiles),
    },
    stateInfoAccentProps: {
      total: infoAccentTotal,
      files: Object.fromEntries(infoAccentFiles),
    },
  }, null, 2)}\n`, 'utf8');
}

function compareAgainstBaseline(label, total, fileCounts, baselineSection, failures) {
  if (total > baselineSection.total) {
    failures.push(`${label} total increased: ${total} > baseline ${baselineSection.total}`);
  }
  for (const [file, count] of fileCounts.entries()) {
    const allowed = typeof baselineSection.files[file] === 'number' ? baselineSection.files[file] : 0;
    if (count > allowed) {
      failures.push(`${label} in ${file}: ${count} > baseline ${allowed}`);
    }
  }
}

function printSummary(label, total, fileCounts, baselineTotal) {
  const top = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`[check-css-token-usage] ${label}: ${total} (baseline=${baselineTotal}) across ${fileCounts.size} file(s)`);
  for (const [file, count] of top) {
    console.log(`  - ${file}: ${count}`);
  }
}

function main() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  const rawFileCounts = new Map();
  const infoAllFileCounts = new Map();
  const infoAccentFileCounts = new Map();
  let rawTotal = 0;
  let infoAllTotal = 0;
  let infoAccentTotal = 0;

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    if (!ALLOW_RAW_COLOR_FILES.has(relPath)) {
      let count = 0;
      for (const line of content.split(/\r?\n/)) {
        count += countRawColorMatches(line);
      }
      if (count > 0) {
        rawFileCounts.set(relPath, count);
        rawTotal += count;
      }
    }

    if (relPath !== 'src/styles/tokens.css') {
      const { allCount, accentCount } = countStateInfoDecls(content);
      if (allCount > 0) {
        infoAllFileCounts.set(relPath, allCount);
        infoAllTotal += allCount;
      }
      if (accentCount > 0) {
        infoAccentFileCounts.set(relPath, accentCount);
        infoAccentTotal += accentCount;
      }
    }
  }

  if (writeBaseline) {
    writeBaselineFile(
      rawTotal,
      rawFileCounts,
      infoAllTotal,
      infoAllFileCounts,
      infoAccentTotal,
      infoAccentFileCounts,
    );
    console.log(
      `[check-css-token-usage] baseline written (raw=${rawTotal}, stateInfoAll=${infoAllTotal}, stateInfoAccentProps=${infoAccentTotal})`,
    );
    return;
  }

  const baseline = readBaseline();
  const failures = [];

  compareAgainstBaseline('raw color usage', rawTotal, rawFileCounts, baseline.rawColors, failures);
  compareAgainstBaseline(
    'legacy --state-info-* usage (ADR-0109)',
    infoAllTotal,
    infoAllFileCounts,
    baseline.stateInfoAll,
    failures,
  );
  compareAgainstBaseline(
    'legacy --state-info-* on accent/surface/outline/shadow/border properties (ADR-0109)',
    infoAccentTotal,
    infoAccentFileCounts,
    baseline.stateInfoAccentProps,
    failures,
  );

  printSummary('raw color matches (excluding tokens.css)', rawTotal, rawFileCounts, baseline.rawColors.total);
  printSummary('legacy --state-info-* declarations (excluding tokens.css)', infoAllTotal, infoAllFileCounts, baseline.stateInfoAll.total);
  printSummary('legacy --state-info-* on accent/surface/outline/shadow/border', infoAccentTotal, infoAccentFileCounts, baseline.stateInfoAccentProps.total);

  if (failures.length === 0) {
    console.log('[check-css-token-usage] no regressions vs baseline');
    return;
  }

  console.error(`[check-css-token-usage] ${failures.length} regression(s) detected`);
  for (const item of failures.slice(0, 80)) {
    console.error(`  - ${item}`);
  }
  if (strict) process.exit(1);
}

main();
