import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-inline-style-baseline.json');
const WHITELIST_PATH = path.join(ROOT, 'scripts', 'css-inline-style-whitelist.json');
const INLINE_STYLE_PATTERN = /style\s*=\s*\{\{/g;

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

function shouldSkip(relPath) {
  return /\.(test|spec)\.[tj]sx?$/.test(relPath)
    || /[\\/]__tests__[\\/]/.test(relPath)
    || relPath.endsWith('.d.ts');
}

function computeTextSha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function normalizeWhitespace(input) {
  return input.replace(/\s+/g, ' ').trim();
}

function findMatchingExpressionEnd(content, startIndex) {
  let depth = 0;
  let state = 'normal';

  for (let index = startIndex; index < content.length; index += 1) {
    const current = content[index];
    const next = content[index + 1] ?? '';
    const previous = content[index - 1] ?? '';

    if (state === 'line-comment') {
      if (current === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      if (previous === '*' && current === '/') state = 'normal';
      continue;
    }

    if (state === 'single-quote') {
      if (current === '\'' && previous !== '\\') state = 'normal';
      continue;
    }

    if (state === 'double-quote') {
      if (current === '"' && previous !== '\\') state = 'normal';
      continue;
    }

    if (state === 'template') {
      if (current === '`' && previous !== '\\') state = 'normal';
      continue;
    }

    if (current === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
      continue;
    }

    if (current === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
      continue;
    }

    if (current === '\'') {
      state = 'single-quote';
      continue;
    }

    if (current === '"') {
      state = 'double-quote';
      continue;
    }

    if (current === '`') {
      state = 'template';
      continue;
    }

    if (current === '{') {
      depth += 1;
      continue;
    }

    if (current === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

export function collectInlineStyleOccurrencesForFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const occurrences = [];

  for (const match of content.matchAll(INLINE_STYLE_PATTERN)) {
    const startIndex = match.index ?? -1;
    if (startIndex < 0) continue;

    const expressionStartIndex = content.indexOf('{', startIndex + match[0].indexOf('{'));
    if (expressionStartIndex < 0) continue;

    const expressionEndIndex = findMatchingExpressionEnd(content, expressionStartIndex);
    if (expressionEndIndex < 0) continue;

    const raw = content.slice(startIndex, expressionEndIndex + 1);
    const normalized = normalizeWhitespace(raw);
    const line = content.slice(0, startIndex).split(/\r?\n/).length;

    occurrences.push({
      line,
      raw,
      normalized,
      reviewedSha256: computeTextSha256(normalized),
    });
  }

  return occurrences;
}

export function matchInlineStyleWhitelistEntry(relPath, occurrences, whitelistEntry, options = {}) {
  const validateHashes = options.validateHashes !== false;
  const failures = [];
  const matchedIndexes = new Set();
  const matchedOccurrences = [];

  if (!whitelistEntry) {
    return { failures, matchedOccurrences };
  }

  for (const snippet of whitelistEntry.snippets) {
    const matchingIndexes = [];
    for (let index = 0; index < occurrences.length; index += 1) {
      if (occurrences[index].normalized.includes(snippet.anchor)) {
        matchingIndexes.push(index);
      }
    }

    if (matchingIndexes.length === 0) {
      failures.push(`stale inline style whitelist anchor for ${relPath}: ${snippet.anchor}`);
      continue;
    }

    if (matchingIndexes.length > 1) {
      failures.push(`ambiguous inline style whitelist anchor for ${relPath}: ${snippet.anchor}`);
      continue;
    }

    const occurrenceIndex = matchingIndexes[0];
    if (matchedIndexes.has(occurrenceIndex)) {
      failures.push(`duplicate inline style whitelist anchor for ${relPath}: ${snippet.anchor}`);
      continue;
    }

    matchedIndexes.add(occurrenceIndex);
    const occurrence = occurrences[occurrenceIndex];
    matchedOccurrences.push({ snippet, occurrence });

    if (validateHashes && occurrence.reviewedSha256 !== snippet.reviewedSha256) {
      failures.push(
        `inline style whitelist review is stale for ${relPath}: anchor \"${snippet.anchor}\" diverged from reviewedSha256; re-review reason and refresh stamp (reviewedAt=${whitelistEntry.reviewedAt}, reviewer=${whitelistEntry.reviewer})`,
      );
    }
  }

  return { failures, matchedOccurrences };
}

export function readInlineStyleBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { total: 0, files: {}, rawTotal: 0, approvedTotal: 0, approvedFiles: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return {
      total: typeof parsed?.total === 'number' ? parsed.total : 0,
      files: parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : {},
      rawTotal: typeof parsed?.rawTotal === 'number' ? parsed.rawTotal : 0,
      approvedTotal: typeof parsed?.approvedTotal === 'number' ? parsed.approvedTotal : 0,
      approvedFiles: parsed && typeof parsed.approvedFiles === 'object' && parsed.approvedFiles ? parsed.approvedFiles : {},
    };
  } catch {
    return { total: 0, files: {}, rawTotal: 0, approvedTotal: 0, approvedFiles: {} };
  }
}

export function writeInlineStyleBaseline(stats) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: stats.effectiveTotal,
    rawTotal: stats.rawTotal,
    approvedTotal: stats.approvedTotal,
    files: Object.fromEntries(stats.effectiveFiles.map(([file, count]) => [file, count])),
    approvedFiles: Object.fromEntries(stats.approvedFiles.map(([file, count]) => [file, count])),
  }, null, 2)}\n`, 'utf8');
}

function readInlineStyleWhitelist() {
  if (!fs.existsSync(WHITELIST_PATH)) return { entries: new Map(), failures: [] };
  const parsed = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'));
  const entries = new Map();
  const failures = [];
  const allowedEntries = Array.isArray(parsed?.allowed) ? parsed.allowed : [];

  for (const entry of allowedEntries) {
    if (!entry || typeof entry.file !== 'string') {
      failures.push('invalid whitelist entry: missing file');
      continue;
    }
    if (entries.has(entry.file)) {
      failures.push(`duplicate whitelist entry: ${entry.file}`);
      continue;
    }
    if (!Array.isArray(entry.snippets) || entry.snippets.length < 1) {
      failures.push(`invalid whitelist snippets for ${entry.file}`);
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      failures.push(`missing whitelist reason for ${entry.file}`);
      continue;
    }
    if (typeof entry.reviewer !== 'string' || entry.reviewer.trim().length === 0) {
      failures.push(`missing whitelist reviewer for ${entry.file}`);
      continue;
    }
    if (typeof entry.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt.trim())) {
      failures.push(`missing or invalid whitelist reviewedAt for ${entry.file}`);
      continue;
    }
    const snippets = [];
    let snippetFailed = false;
    for (const snippet of entry.snippets) {
      if (!snippet || typeof snippet.anchor !== 'string' || snippet.anchor.trim().length === 0) {
        failures.push(`missing whitelist anchor for ${entry.file}`);
        snippetFailed = true;
        break;
      }
      if (typeof snippet.reviewedSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(snippet.reviewedSha256.trim())) {
        failures.push(`missing or invalid whitelist reviewedSha256 for ${entry.file}#${snippet.anchor}`);
        snippetFailed = true;
        break;
      }
      snippets.push({
        anchor: normalizeWhitespace(snippet.anchor),
        reviewedSha256: snippet.reviewedSha256.trim().toLowerCase(),
      });
    }
    if (snippetFailed) {
      continue;
    }
    entries.set(entry.file, {
      reason: entry.reason.trim(),
      reviewer: entry.reviewer.trim(),
      reviewedAt: entry.reviewedAt.trim(),
      snippets,
    });
  }

  return { entries, failures };
}

export function collectInlineStyleStats() {
  const sourceFiles = walkFiles(SRC_DIR, (filePath) => filePath.endsWith('.tsx') || filePath.endsWith('.jsx'));
  const whitelist = readInlineStyleWhitelist();
  const rawFiles = [];
  const approvedFiles = [];
  const effectiveFiles = [];
  const whitelistFailures = [...whitelist.failures];
  const seenFiles = new Set();

  let rawTotal = 0;
  let approvedTotal = 0;
  let effectiveTotal = 0;

  for (const filePath of sourceFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    if (shouldSkip(relPath)) continue;
    const occurrences = collectInlineStyleOccurrencesForFile(filePath);
    const count = occurrences.length;
    if (count === 0) continue;

    seenFiles.add(relPath);
    rawFiles.push([relPath, count]);
    rawTotal += count;

    const allowed = whitelist.entries.get(relPath);
    const { failures, matchedOccurrences } = matchInlineStyleWhitelistEntry(relPath, occurrences, allowed);
    whitelistFailures.push(...failures);
    const approvedCount = matchedOccurrences.length;
    const effectiveCount = Math.max(0, count - approvedCount);

    if (approvedCount > 0) {
      approvedFiles.push([relPath, approvedCount, `${allowed.reason} | reviewed ${allowed.reviewedAt} by ${allowed.reviewer}`]);
      approvedTotal += approvedCount;
    }

    if (effectiveCount > 0) {
      effectiveFiles.push([relPath, effectiveCount]);
      effectiveTotal += effectiveCount;
    }
  }

  for (const [file, entry] of whitelist.entries.entries()) {
    if (!seenFiles.has(file)) {
      whitelistFailures.push(`stale inline style whitelist entry: ${file} allows ${entry.snippets.length} snippet(s) but current raw count is 0`);
    }
  }

  rawFiles.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  approvedFiles.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  effectiveFiles.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return {
    rawTotal,
    approvedTotal,
    effectiveTotal,
    rawFiles,
    approvedFiles,
    effectiveFiles,
    whitelistFailures,
  };
}