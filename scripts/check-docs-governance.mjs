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
    label: 'research',
    pattern: /^docs\/调研-.*\.md$/,
    expected: '文档角色：调研文档',
  },
  {
    label: 'release note',
    pattern: /^docs\/发布说明-.*\.md$/,
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
    || relativePath.startsWith('docs/services/')
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

const failures = [];
const markdownFiles = listMarkdownFiles(docsRoot);

for (const fullPath of markdownFiles) {
  const relativePath = toPosix(path.relative(workspaceRoot, fullPath));
  const source = fs.readFileSync(fullPath, 'utf8');
  const frontmatter = parseFrontmatter(source);

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

  if (requiresLinkValidation(relativePath)) {
    const links = extractMarkdownLinks(source);
    for (const rawLink of links) {
      const target = normalizeLinkTarget(rawLink);
      if (!target || target.startsWith('#')) continue;
      if (/^(https?:|mailto:|tel:)/i.test(target)) continue;

      const [targetPath] = target.split('#');
      if (!targetPath) continue;

      const candidates = resolveLinkTarget(fullPath, targetPath);
      const resolved = candidates.find((candidate) => fs.existsSync(candidate));
      if (!resolved) {
        failures.push(`${relativePath}: broken link target \`${target}\``);
      }
    }
  }
}

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