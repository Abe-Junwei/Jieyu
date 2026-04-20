import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, 'src');
const BASELINE_PATH = path.resolve(ROOT, 'scripts/translation-host-link-ssot-baseline.json');

const PARENT_TOKEN_REGEX = /\bparentLayerIds?\b/g;
const TRANSLATION_HINT_REGEX = /\btranslation(?:Layer|Layers)?\b|['"]translation['"]/;

const IGNORE_PATH_PATTERNS = [
  /\.d\.ts$/,
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /[\\/]__tests__[\\/]/,
  /[\\/]i18n[\\/]index\.ts$/,
];

function toRel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function shouldIgnore(filePath) {
  return IGNORE_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function parseArgs(argv) {
  const options = {
    strict: true,
    changedOnly: false,
    writeBaseline: false,
    baselinePath: BASELINE_PATH,
  };

  for (const arg of argv) {
    if (arg === '--changed-only') {
      options.changedOnly = true;
      continue;
    }
    if (arg === '--write-baseline') {
      options.writeBaseline = true;
      continue;
    }
    if (arg === '--report-only') {
      options.strict = false;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg.startsWith('--baseline=')) {
      options.baselinePath = path.resolve(ROOT, arg.slice('--baseline='.length));
      continue;
    }
  }

  return options;
}

function runGitCommand(command) {
  try {
    const out = execSync(command, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

function listSourceFiles(dirPath) {
  const entries = readdirSync(dirPath);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    files.push(fullPath);
  }
  return files;
}

function countParentTokens(text) {
  PARENT_TOKEN_REGEX.lastIndex = 0;
  let count = 0;
  while (PARENT_TOKEN_REGEX.exec(text)) {
    count += 1;
  }
  return count;
}

function collectUsageStats(changedOnly) {
  const changedSet = changedOnly ? getChangedPaths() : null;
  const sourceFiles = listSourceFiles(SRC_DIR);
  const stats = {};

  for (const absPath of sourceFiles) {
    if (shouldIgnore(absPath)) continue;
    const relPath = toRel(absPath);
    if (changedSet && !changedSet.has(relPath)) continue;

    const content = readFileSync(absPath, 'utf8');
    const parentCount = countParentTokens(content);
    if (parentCount === 0) continue;
    if (!TRANSLATION_HINT_REGEX.test(content)) continue;

    stats[relPath] = parentCount;
  }

  return stats;
}

function loadBaseline(baselinePath) {
  if (!existsSync(baselinePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.files || typeof parsed.files !== 'object') {
      return {};
    }
    return parsed.files;
  } catch {
    return {};
  }
}

function writeBaseline(baselinePath, stats) {
  const payload = {
    generatedAt: new Date().toISOString(),
    description: 'translation host SSOT guard baseline (parent* token count in translation-related source files)',
    files: stats,
  };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const stats = collectUsageStats(options.changedOnly);

  if (options.writeBaseline) {
    writeBaseline(options.baselinePath, stats);
    console.log(`[check-translation-host-link-ssot] baseline written: ${toRel(options.baselinePath)} (${Object.keys(stats).length} files)`);
    return;
  }

  const baseline = loadBaseline(options.baselinePath);
  const violations = [];

  for (const [filePath, count] of Object.entries(stats)) {
    const base = baseline[filePath];
    if (base === undefined) {
      violations.push(`${filePath}: new translation parent* usage (count=${count})`);
      continue;
    }
    if (count > Number(base)) {
      violations.push(`${filePath}: parent* usage increased (${base} -> ${count})`);
    }
  }

  if (violations.length > 0) {
    console.error('[check-translation-host-link-ssot] violations found:');
    for (const item of violations) {
      console.error(`- ${item}`);
    }
    console.error('Hint: reduce parent*-based translation host logic, or run --write-baseline only when intentionally ratcheting with review.');
    if (options.strict) {
      process.exit(1);
    }
  }

  console.log(`[check-translation-host-link-ssot] OK: scanned ${Object.keys(stats).length} files.`);
}

main();
