import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const docsRoot = path.join(workspaceRoot, 'docs');
const reportOnly = process.argv.includes('--report-only');
const validateAllLinks = process.argv.includes('--all-links');

const requiredFrontmatterKeys = [
  'title',
  'doc_type',
  'status',
  'owner',
  'last_reviewed',
  'source_of_truth',
];

const roleBannerRules = [
  {
    label: 'historical plan',
    pattern: /^docs\/规划-.*\.md$/,
    expected: '文档角色：历史规划文档',
  },
  {
    label: 'historical plan (archived root)',
    pattern: /^docs\/execution\/archive\/historical-root-docs\/规划-.*\.md$/,
    expected: '文档角色：历史规划文档',
  },
  {
    label: 'research',
    pattern: /^docs\/调研-.*\.md$/,
    expected: '文档角色：调研文档',
  },
  {
    label: 'research (archived root)',
    pattern: /^docs\/execution\/archive\/historical-root-docs\/调研-.*\.md$/,
    expected: '文档角色：调研文档',
  },
  {
    label: 'release note',
    pattern: /^docs\/发布说明-.*\.md$/,
    expected: '文档角色：发布说明文档',
  },
  {
    label: 'release note (archived root)',
    pattern: /^docs\/execution\/archive\/historical-root-docs\/发布说明-.*\.md$/,
    expected: '文档角色：发布说明文档',
  },
];

function toPosix(filePath) {
  return filePath.replaceAll(path.sep, '/');
}

function listMarkdownFiles(rootDir) {
  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

function parseFrontmatter(source) {
  if (!source.startsWith('---\n')) return null;
  const endIndex = source.indexOf('\n---\n', 4);
  if (endIndex === -1) return null;
  const block = source.slice(4, endIndex).split('\n');
  const values = new Map();
  for (const line of block) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!match) continue;
    values.set(match[1], match[2].trim());
  }
  return values;
}

function requiresStableFrontmatter(relativePath) {
  return relativePath === 'docs/README.md'
    || relativePath.startsWith('docs/architecture/')
    || relativePath.startsWith('docs/adr/')
    || relativePath === 'docs/execution/README.md'
    || /^docs\/execution\/(governance|release-gates|plans|audits)\/README\.md$/.test(relativePath);
}

function requiresLinkValidation(relativePath) {
  if (validateAllLinks) return true;
  return requiresStableFrontmatter(relativePath)
    || /^docs\/发布说明-.*\.md$/.test(relativePath)
    || /^docs\/execution\/release-gates\/.*\.md$/.test(relativePath);
}

function extractMarkdownLinks(source) {
  const links = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of source.matchAll(pattern)) {
    links.push(match[1].trim());
  }
  return links;
}

function normalizeLinkTarget(rawTarget) {
  let target = rawTarget;
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }
  const titleMatch = target.match(/^(\S+)\s+".*"$/);
  if (titleMatch) return titleMatch[1];
  return target;
}

function resolveLinkTarget(currentFilePath, targetPath) {
  const decodedTarget = decodeURIComponent(targetPath);
  if (decodedTarget.startsWith('/')) {
    return [path.join(workspaceRoot, decodedTarget.slice(1))];
  }
  return [
    path.resolve(path.dirname(currentFilePath), decodedTarget),
    path.resolve(workspaceRoot, decodedTarget),
  ];
}

function isMainModule() {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return entry.endsWith(`${path.sep}check-docs-governance.mjs`);
}

const ADR_STATUSES = new Set(['accepted', 'superseded']);

const ENTRY_LINK_FILES = [
  'README.md',
  'AGENTS.md',
  'AI_QUICKSTART.md',
  'copilot-instructions.md',
  '.github/pull_request_template.md',
];

function unquote(value) {
  if (!value) return value;
  return value.replace(/^['"]|['"]$/g, '');
}

/**
 * Local markdown links that do not resolve. Skips anchors and external URLs.
 * @param {string} fullPath
 * @param {string} source
 * @param {(candidate: string) => boolean} [exists]
 */
export function localLinkFailures(fullPath, source, exists = fs.existsSync) {
  const relativePath = toPosix(path.relative(workspaceRoot, fullPath));
  const failures = [];
  for (const rawLink of extractMarkdownLinks(source)) {
    const target = normalizeLinkTarget(rawLink);
    if (!target || target.startsWith('#')) continue;
    if (/^(https?:|mailto:|tel:)/i.test(target)) continue;
    const [targetPath] = target.split('#');
    if (!targetPath) continue;
    const resolved = resolveLinkTarget(fullPath, targetPath).find((candidate) => exists(candidate));
    if (!resolved) failures.push(`${relativePath}: broken link target \`${target}\``);
  }
  return failures;
}

/**
 * ADR status is only accepted or superseded. A superseded record must link to another ADR that exists.
 * @param {string} fullPath
 * @param {string} source
 * @param {(candidate: string) => boolean} [exists]
 */
export function adrRecordFailures(fullPath, source, exists = fs.existsSync) {
  const relativePath = toPosix(path.relative(workspaceRoot, fullPath));
  const failures = [];
  const frontmatter = parseFrontmatter(source);
  const status = unquote(frontmatter?.get('status'));
  if (!ADR_STATUSES.has(status ?? '')) {
    failures.push(`${relativePath}: ADR status must be accepted or superseded`);
    return failures;
  }
  if (status !== 'superseded') return failures;

  const linkedAdr = extractMarkdownLinks(source).some((rawLink) => {
    const target = normalizeLinkTarget(rawLink);
    if (!target || target.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(target)) return false;
    const [targetPath] = target.split('#');
    if (!targetPath) return false;
    return resolveLinkTarget(fullPath, targetPath).some((candidate) => {
      if (!exists(candidate)) return false;
      const rel = toPosix(path.relative(workspaceRoot, candidate));
      return rel.startsWith('docs/adr/') && rel.endsWith('.md') && rel !== relativePath;
    });
  });
  if (!linkedAdr) {
    failures.push(`${relativePath}: superseded ADR must link to an existing ADR`);
  }
  return failures;
}

const DOC_LOCATIONS = [
  /^docs\/README\.md$/,
  /^docs\/adr\/[^/]+\.md$/,
  /^docs\/architecture\/.+\.md$/,
  /^docs\/development\/[^/]+\.md$/,
  /^docs\/execution\/README\.md$/,
  /^docs\/execution\/audits\/README\.md$/,
  /^docs\/execution\/(plans|governance|release-gates)\/[^/]+\.md$/,
  /^docs\/execution\/release-gates\/release-evidence\/[^/]+\.md$/,
  /^docs\/execution\/specs\/(README\.md|[^/]+\/(requirements|design|tasks)\.md)$/,
  /^docs\/wayfinder\/[^/]+\/.+\.md$/,
];

/** Every docs markdown file belongs to a type in ADR-0051. */
export function docLocationFailures(relativePath) {
  if (DOC_LOCATIONS.some((pattern) => pattern.test(relativePath))) return [];
  return [`${relativePath}: not a known doc location (ADR-0051); move it or delete it`];
}

/** A spec whose tasks are all checked has landed and leaves the tree. */
export function specTasksFailures(relativePath, source) {
  const match = relativePath.match(/^docs\/execution\/specs\/([^/]+)\/tasks\.md$/);
  if (!match || match[1] === '_template') return [];
  if (/^\s*[-*] \[ \]/m.test(source)) return [];
  return [`${relativePath}: every task is checked; delete docs/execution/specs/${match[1]}/ (ADR-0051)`];
}

const CODE_PATH_PATTERN = /`((?:src|scripts|docs|tests|\.github|\.cursor)\/[^`\s]+?\.[A-Za-z0-9]+)(?:[:#][^`]*)?`/g;
const PLACEHOLDER_PATH = /Xxx|Yyy|[<>{}*]/;
// ponytail: line-level keyword skip; a ban or obituary line that also names a live path hides that path. Upgrade: per-sentence parsing.
const OBITUARY_LINE = /不要|禁止|不得|不再|不建|已删|删除|删掉|不存在|已移除|废弃/;

/** Backtick repo paths in prose. Placeholders and ban/obituary lines are skipped. */
export function extractCodePaths(source) {
  const paths = new Set();
  for (const line of source.split('\n')) {
    if (OBITUARY_LINE.test(line)) continue;
    for (const match of line.matchAll(CODE_PATH_PATTERN)) {
      if (!PLACEHOLDER_PATH.test(match[1])) paths.add(match[1]);
    }
  }
  return [...paths];
}

export function codePathFailures(relativePath, source, exists = fs.existsSync) {
  return extractCodePaths(source)
    .filter((codePath) => !exists(path.join(workspaceRoot, codePath)))
    .map((codePath) => `${relativePath}: path \`${codePath}\` does not exist`);
}

function isStrictCodePathFile(relativePath) {
  return ENTRY_LINK_FILES.includes(relativePath)
    || relativePath.startsWith('.cursor/rules/')
    || relativePath.startsWith('docs/architecture/')
    || relativePath.startsWith('docs/development/');
}

const CITER_PATHS = ['package.json', 'scripts', 'src', 'tests', '.github', '.cursor', ...ENTRY_LINK_FILES];

/** Contracts, guides, gates and ledgers stay only while code, a check, or an entry file names them. */
export function requiresCitation(relativePath) {
  if (relativePath.endsWith('/README.md')) return false;
  return /^docs\/(architecture|development)\/[^/]+\.md$/.test(relativePath)
    || /^docs\/execution\/(release-gates|governance)\/[^/]+\.md$/.test(relativePath);
}

export function uncitedDocFailures(relativePaths, citerSources) {
  return relativePaths
    .filter((relativePath) => !citerSources.some((source) => source.includes(path.posix.basename(relativePath))))
    .map((relativePath) => `${relativePath}: no entry file, code, test, script or workflow names it; delete it or cite it where it is used (ADR-0051)`);
}

function readCiterSources() {
  const result = spawnSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '--', ...CITER_PATHS], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return result.stdout.split('\0').filter(Boolean)
    .filter((rel) => /\.([cm]?[jt]sx?|json|md|mdc|ya?ml|css|html|sh)$/.test(rel))
    .map((rel) => {
      try { return fs.readFileSync(path.join(workspaceRoot, rel), 'utf8'); } catch { return ''; }
    });
}

/** Docs whose backtick paths include a changed file while the doc itself did not change. */
export function codeDriftWarnings(changedFiles, docs) {
  const warnings = [];
  for (const { relativePath, source } of docs) {
    if (changedFiles.has(relativePath)) continue;
    const touched = extractCodePaths(source)
      .filter((codePath) => !/\.mdc?$/.test(codePath) && changedFiles.has(codePath));
    if (touched.length > 0) warnings.push(`${relativePath} names ${touched.join(', ')}`);
  }
  return warnings;
}

export function listPathCheckedDocs() {
  return [
    ...listMarkdownFiles(docsRoot).filter((fullPath) => !toPosix(path.relative(workspaceRoot, fullPath)).startsWith('docs/adr/')),
    ...listEntryLinkFiles(),
  ]
    .filter((fullPath) => fs.existsSync(fullPath))
    .map((fullPath) => ({
      relativePath: toPosix(path.relative(workspaceRoot, fullPath)),
      source: fs.readFileSync(fullPath, 'utf8'),
    }));
}

function listEntryLinkFiles() {
  const files = ENTRY_LINK_FILES.map((rel) => path.join(workspaceRoot, rel));
  const rulesDir = path.join(workspaceRoot, '.cursor/rules');
  if (fs.existsSync(rulesDir)) {
    for (const name of fs.readdirSync(rulesDir)) {
      if (name.endsWith('.mdc') || name.endsWith('.md')) {
        files.push(path.join(rulesDir, name));
      }
    }
  }
  return files;
}

function run() {
  const failures = [];
  const warnings = [];
  const markdownFiles = listMarkdownFiles(docsRoot);
  const citationCandidates = [];

  for (const fullPath of markdownFiles) {
    const relativePath = toPosix(path.relative(workspaceRoot, fullPath));
    const source = fs.readFileSync(fullPath, 'utf8');
    const frontmatter = parseFrontmatter(source);

    failures.push(...docLocationFailures(relativePath), ...specTasksFailures(relativePath, source));
    if (requiresCitation(relativePath)) citationCandidates.push(relativePath);

    if (requiresStableFrontmatter(relativePath)) {
      if (!frontmatter) {
        failures.push(`${relativePath}: missing required frontmatter block`);
      } else {
        for (const key of requiredFrontmatterKeys) {
          if (!frontmatter.has(key)) {
            failures.push(`${relativePath}: missing required frontmatter key \`${key}\``);
          }
        }
      }
    }

    for (const rule of roleBannerRules) {
      if (!rule.pattern.test(relativePath)) continue;
      const opening = source.split('\n').slice(0, 6).join('\n');
      if (!opening.includes(rule.expected)) {
        failures.push(`${relativePath}: missing ${rule.label} role banner`);
      }
    }

    if (relativePath.startsWith('docs/adr/') && relativePath.endsWith('.md')) {
      failures.push(...adrRecordFailures(fullPath, source));
    }

    if (requiresLinkValidation(relativePath)) {
      failures.push(...localLinkFailures(fullPath, source));
    }
  }

  for (const fullPath of listEntryLinkFiles()) {
    if (!fs.existsSync(fullPath)) {
      failures.push(`${toPosix(path.relative(workspaceRoot, fullPath))}: entry file missing`);
      continue;
    }
    failures.push(...localLinkFailures(fullPath, fs.readFileSync(fullPath, 'utf8')));
  }

  for (const { relativePath, source } of listPathCheckedDocs()) {
    const pathFailures = codePathFailures(relativePath, source);
    (isStrictCodePathFile(relativePath) ? failures : warnings).push(...pathFailures);
  }

  failures.push(...uncitedDocFailures(citationCandidates, readCiterSources()));

  for (const warning of warnings) console.warn(`[check-docs-governance] WARN: ${warning}`);

  if (failures.length > 0) {
    const prefix = reportOnly ? '[check-docs-governance] REPORT' : '[check-docs-governance] FAILED';
    console.error(prefix);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    if (!reportOnly) {
      process.exit(1);
    }
  }

  console.log(`[check-docs-governance] OK: validated ${markdownFiles.length} markdown files.`);
}

if (isMainModule()) run();
