const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const DEFAULT_BASELINE_PATH = path.join(ROOT, 'scripts', 'i18n-hardcoded-baseline.json');
const HAN_REGEX = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const LITERAL_REGEX = /'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g;
const JSX_TEXT_REGEX = />([^<{]*[\u3400-\u9FFF\uF900-\uFAFF][^<{]*)</g;

const IGNORE_PATH_PATTERNS = [
  /[\\/]i18n[\\/]index\.ts$/,
  /\.d\.ts$/,
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /[\\/]__tests__[\\/]/,
];

function shouldIgnore(filePath) {
  return IGNORE_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function toWorkspaceRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function parseArgs(argv) {
  const options = {
    strict: false,
    summaryOnly: false,
    changedOnly: false,
    writeBaseline: false,
    baselinePath: DEFAULT_BASELINE_PATH,
    thresholdConfigPath: null,
  };

  for (const arg of argv) {
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--summary-only') {
      options.summaryOnly = true;
      continue;
    }
    if (arg === '--changed-only') {
      options.changedOnly = true;
      continue;
    }
    if (arg === '--write-baseline') {
      options.writeBaseline = true;
      continue;
    }
    if (arg.startsWith('--baseline=')) {
      options.baselinePath = path.resolve(ROOT, arg.slice('--baseline='.length));
      continue;
    }
    if (arg.startsWith('--threshold-config=')) {
      options.thresholdConfigPath = path.resolve(ROOT, arg.slice('--threshold-config='.length));
    }
  }

  return options;
}

function loadThresholdConfig(thresholdConfigPath) {
  if (!thresholdConfigPath) return null;
  if (!fs.existsSync(thresholdConfigPath)) {
    throw new Error(`threshold config not found: ${toWorkspaceRelative(thresholdConfigPath)}`);
  }

  const parsed = JSON.parse(fs.readFileSync(thresholdConfigPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
    throw new Error(`invalid threshold config format: ${toWorkspaceRelative(thresholdConfigPath)}`);
  }

  const rules = parsed.rules
    .filter((rule) => rule && typeof rule === 'object')
    .map((rule) => ({
      prefix: String(rule.prefix || '').trim(),
      ...(Number.isFinite(Number(rule.maxDelta)) ? { maxDelta: Number(rule.maxDelta) } : {}),
      ...(Number.isFinite(Number(rule.maxTotal)) ? { maxTotal: Number(rule.maxTotal) } : {}),
      ...(typeof rule.label === 'string' && rule.label.trim().length > 0 ? { label: rule.label.trim() } : {}),
    }))
    .filter((rule) => rule.prefix.length > 0);

  if (rules.length === 0) {
    throw new Error(`threshold config has no valid rules: ${toWorkspaceRelative(thresholdConfigPath)}`);
  }

  return {
    filePath: thresholdConfigPath,
    rules,
  };
}

function sumForPrefix(fileCounts, prefix) {
  let total = 0;
  for (const [filePath, count] of Object.entries(fileCounts)) {
    if (!filePath.startsWith(prefix)) continue;
    total += Number(count || 0);
  }
  return total;
}

function evaluateDirectoryThresholds(fileCounts, baselineFiles, thresholdConfig) {
  if (!thresholdConfig) {
    return {
      results: [],
      violations: [],
    };
  }

  const results = [];
  const violations = [];

  for (const rule of thresholdConfig.rules) {
    const baselineHits = sumForPrefix(baselineFiles, rule.prefix);
    const currentHits = sumForPrefix(fileCounts, rule.prefix);
    const delta = currentHits - baselineHits;
    const result = {
      ...rule,
      baselineHits,
      currentHits,
      delta,
    };
    results.push(result);

    if (Object.prototype.hasOwnProperty.call(rule, 'maxDelta') && delta > rule.maxDelta) {
      violations.push({
        ...result,
        reason: `delta +${delta} exceeds maxDelta ${rule.maxDelta}`,
      });
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(rule, 'maxTotal') && currentHits > rule.maxTotal) {
      violations.push({
        ...result,
        reason: `current ${currentHits} exceeds maxTotal ${rule.maxTotal}`,
      });
    }
  }

  return {
    results,
    violations,
  };
}

function runGitCommand(command) {
  try {
    const output = execSync(command, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getChangedPaths() {
  const changed = new Set();
  const unstaged = runGitCommand('git diff --name-only --diff-filter=ACMRTUXB');
  const staged = runGitCommand('git diff --cached --name-only --diff-filter=ACMRTUXB');
  const untracked = runGitCommand('git ls-files --others --exclude-standard');

  for (const relPath of [...unstaged, ...staged, ...untracked]) {
    const normalized = relPath.split(path.sep).join('/');
    if (!normalized.startsWith('src/')) continue;
    changed.add(normalized);
  }
  return changed;
}

function listSourceFiles(dirPath, changedOnlyPaths) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath, changedOnlyPaths));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.[tj]sx?$/.test(entry.name)) continue;
    if (shouldIgnore(fullPath)) continue;
    if (changedOnlyPaths) {
      const relPath = toWorkspaceRelative(fullPath);
      if (!changedOnlyPaths.has(relPath)) continue;
    }
    files.push(fullPath);
  }
  return files;
}

function stripBlockComments(line, state) {
  if (!line) return line;

  let text = line;
  if (state.inBlockComment) {
    const end = text.indexOf('*/');
    if (end === -1) return '';
    state.inBlockComment = false;
    text = text.slice(end + 2);
  }

  while (text.includes('/*')) {
    const start = text.indexOf('/*');
    const end = text.indexOf('*/', start + 2);
    if (end === -1) {
      state.inBlockComment = true;
      text = text.slice(0, start);
      break;
    }
    text = `${text.slice(0, start)} ${text.slice(end + 2)}`;
  }

  return text;
}

function clipSnippet(value) {
  if (value.length <= 100) return value;
  return `${value.slice(0, 97)}...`;
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const relPath = toWorkspaceRelative(filePath);
  const isJsxFile = /\.(tsx|jsx)$/.test(relPath);
  const commentState = { inBlockComment: false };
  const hits = [];

  for (let i = 0; i < lines.length; i += 1) {
    const originalLine = lines[i] ?? '';
    const line = stripBlockComments(originalLine, commentState);
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;
    const commentStart = line.indexOf('//');
    const codeLine = commentStart >= 0 ? line.slice(0, commentStart) : line;
    const sourceLine = codeLine.trim();
    if (!sourceLine) continue;

    const matches = codeLine.match(LITERAL_REGEX);
    if (!matches) continue;

    for (const literal of matches) {
      if (!HAN_REGEX.test(literal)) continue;
      hits.push({
        line: i + 1,
        kind: 'string-literal',
        literal: clipSnippet(literal),
        sourceLine: clipSnippet(sourceLine),
      });
      break;
    }

    if (!isJsxFile) continue;
    const jsxMatches = Array.from(codeLine.matchAll(JSX_TEXT_REGEX));
    if (jsxMatches.length === 0) continue;
    const [firstMatch] = jsxMatches;
    const jsxLiteral = (firstMatch?.[1] ?? '').trim();
    if (!jsxLiteral) continue;
    hits.push({
      line: i + 1,
      kind: 'jsx-text',
      literal: clipSnippet(jsxLiteral),
      sourceLine: clipSnippet(sourceLine),
    });
  }

  return hits;
}

function buildFindings(files) {
  const findings = [];
  for (const filePath of files) {
    const hits = scanFile(filePath);
    if (hits.length === 0) continue;
    findings.push({ filePath, hits });
  }
  return findings;
}

function buildFileCounts(findings) {
  const counts = {};
  for (const item of findings) {
    counts[toWorkspaceRelative(item.filePath)] = item.hits.length;
  }
  return counts;
}

function sumCounts(fileCounts) {
  return Object.values(fileCounts).reduce((sum, value) => sum + Number(value || 0), 0);
}

function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.files !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBaseline(baselinePath, fileCounts, totalHits) {
  const payload = {
    generatedAt: new Date().toISOString(),
    scannerVersion: 2,
    totalHits,
    files: fileCounts,
  };
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function compareAgainstBaseline(fileCounts, baseline) {
  const baselineFiles = baseline?.files ?? {};
  const regressions = [];
  const newFiles = [];

  for (const [filePath, count] of Object.entries(fileCounts)) {
    const hasBaseline = Object.prototype.hasOwnProperty.call(baselineFiles, filePath);
    const baselineCount = Number(baselineFiles[filePath] || 0);
    if (!hasBaseline) {
      newFiles.push({ filePath, count });
      continue;
    }
    if (count > baselineCount) {
      regressions.push({
        filePath,
        baselineCount,
        currentCount: count,
        delta: count - baselineCount,
      });
    }
  }

  const baselineTotal = sumCounts(baselineFiles);
  const currentTotal = sumCounts(fileCounts);

  return {
    regressions,
    newFiles,
    baselineTotal,
    currentTotal,
    delta: currentTotal - baselineTotal,
  };
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`[check-i18n-hardcoded] src directory not found: ${SRC_DIR}`);
    process.exitCode = 1;
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  let thresholdConfig = null;
  try {
    thresholdConfig = loadThresholdConfig(options.thresholdConfigPath);
  } catch (error) {
    console.error(`[check-i18n-hardcoded] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  const changedPaths = options.changedOnly ? getChangedPaths() : null;
  const files = listSourceFiles(SRC_DIR, changedPaths).sort();
  const findings = buildFindings(files);
  const fileCounts = buildFileCounts(findings);
  const totalHits = sumCounts(fileCounts);

  if (options.changedOnly) {
    console.log(`[check-i18n-hardcoded] changed-only mode: scanning ${files.length} file(s).`);
  }

  if (options.writeBaseline) {
    writeBaseline(options.baselinePath, fileCounts, totalHits);
    console.log(`[check-i18n-hardcoded] baseline written: ${toWorkspaceRelative(options.baselinePath)}`);
  }

  if (findings.length === 0) {
    console.log('[check-i18n-hardcoded] OK: no hardcoded Han string literals found in source files.');
    return;
  }

  console.log(`[check-i18n-hardcoded] Found ${totalHits} hit(s) across ${findings.length} file(s).`);

  if (options.summaryOnly) {
    const ranked = findings
      .map((item) => ({
        filePath: toWorkspaceRelative(item.filePath),
        count: item.hits.length,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 20);
    console.log('[check-i18n-hardcoded] Top files:');
    for (const item of ranked) {
      console.log(`- ${item.filePath}: ${item.count}`);
    }
  } else {
    for (const item of findings) {
      const rel = toWorkspaceRelative(item.filePath);
      console.log(`\n[FILE] ${rel} (${item.hits.length})`);
      for (const hit of item.hits.slice(0, 20)) {
        console.log(`  L${hit.line} [${hit.kind}] ${hit.sourceLine}`);
      }
      if (item.hits.length > 20) {
        console.log(`  ... ${item.hits.length - 20} more`);
      }
    }
  }

  const baseline = loadBaseline(options.baselinePath);
  if (baseline) {
    const diff = compareAgainstBaseline(fileCounts, baseline);
    console.log(`[check-i18n-hardcoded] Baseline: ${diff.baselineTotal} -> current: ${diff.currentTotal} (delta: ${diff.delta >= 0 ? `+${diff.delta}` : diff.delta})`);

    const directoryThresholds = evaluateDirectoryThresholds(fileCounts, baseline.files ?? {}, thresholdConfig);
    if (thresholdConfig) {
      console.log(`[check-i18n-hardcoded] Directory thresholds: ${toWorkspaceRelative(thresholdConfig.filePath)}`);
      for (const item of directoryThresholds.results) {
        const name = item.label || item.prefix;
        const deltaText = item.delta >= 0 ? `+${item.delta}` : `${item.delta}`;
        const ruleText = [
          ...(Object.prototype.hasOwnProperty.call(item, 'maxDelta') ? [`maxDelta=${item.maxDelta}`] : []),
          ...(Object.prototype.hasOwnProperty.call(item, 'maxTotal') ? [`maxTotal=${item.maxTotal}`] : []),
        ].join(', ');
        console.log(`- ${name}: ${item.baselineHits} -> ${item.currentHits} (delta: ${deltaText}) [${ruleText}]`);
      }
    }

    if (diff.newFiles.length > 0) {
      console.log('[check-i18n-hardcoded] New files with hits:');
      for (const item of diff.newFiles) {
        console.log(`- ${item.filePath}: ${item.count}`);
      }
    }

    if (diff.regressions.length > 0) {
      console.log('[check-i18n-hardcoded] Regressed files:');
      for (const item of diff.regressions) {
        console.log(`- ${item.filePath}: ${item.baselineCount} -> ${item.currentCount} (+${item.delta})`);
      }
    }

    if (options.strict && (diff.newFiles.length > 0 || diff.regressions.length > 0)) {
      console.error('[check-i18n-hardcoded] strict baseline guard failed: new or regressed hardcoded strings detected.');
      process.exitCode = 1;
    }

    if (options.strict && directoryThresholds.violations.length > 0) {
      console.error('[check-i18n-hardcoded] strict directory threshold guard failed:');
      for (const item of directoryThresholds.violations) {
        const name = item.label || item.prefix;
        console.error(`- ${name}: ${item.reason}`);
      }
      process.exitCode = 1;
    }
    return;
  }

  if (options.strict) {
    if (options.baselinePath && options.baselinePath !== DEFAULT_BASELINE_PATH && !baseline) {
      console.error(`[check-i18n-hardcoded] strict mode requires readable baseline: ${toWorkspaceRelative(options.baselinePath)}`);
    } else {
      console.error('[check-i18n-hardcoded] strict mode enabled: failing due to findings.');
    }
    process.exitCode = 1;
  }
}

main();
