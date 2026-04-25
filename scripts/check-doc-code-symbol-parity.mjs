import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const reportOnly = process.argv.includes('--report');

const docRules = [
  {
    docPath: 'docs/architecture/timeline-unit-governance.md',
    forbiddenSymbolsInDoc: ['LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP'],
    requiredPairs: [
      {
        filePath: 'src/ai/chat/localContextTools.ts',
        symbols: ['normalizeToolName'],
      },
      {
        filePath: 'src/pages/timelineUnitMutationDispatch.ts',
        symbols: ['dispatchTimelineUnitMutation', 'dispatchTimelineUnitSelectionMutation'],
      },
    ],
  },
];

const failures = [];

function readFileSafe(absolutePath) {
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

function extractInlineCodeTokens(line) {
  return Array.from(line.matchAll(/`([^`]+)`/g), (match) => String(match[1] ?? '').trim())
    .filter(Boolean);
}

function isSourceCodePathToken(token) {
  return /^src\/[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|mjs|cjs)$/.test(token);
}

function isCandidateIdentifierToken(token) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token) && token.length >= 4;
}

function hasIgnoreMarker(line) {
  return line.includes('doc-code-symbol-parity:ignore');
}

function assertRequiredPairs(rule, docSource) {
  for (const pair of rule.requiredPairs) {
    const absoluteFilePath = path.join(workspaceRoot, pair.filePath);
    const fileSource = readFileSafe(absoluteFilePath);
    if (fileSource === null) {
      failures.push(`${rule.docPath}: referenced file missing in required pair: ${pair.filePath}`);
      continue;
    }

    for (const symbol of pair.symbols) {
      const symbolMarker = `\`${symbol}\``;
      if (!docSource.includes(symbolMarker)) {
        failures.push(`${rule.docPath}: required symbol mention missing in doc: ${symbol}`);
      }
      if (!fileSource.includes(symbol)) {
        failures.push(`${rule.docPath}: symbol not found in code file ${pair.filePath}: ${symbol}`);
      }
    }
  }
}

function assertInlinePathAndSymbolParity(rule, docSource) {
  const lines = docSource.split(/\r?\n/);
  const sourceFileCache = new Map();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const tokens = extractInlineCodeTokens(line);
    if (tokens.length === 0) continue;

    const sourcePaths = tokens.filter(isSourceCodePathToken);
    if (sourcePaths.length === 0) continue;

    for (const sourcePath of sourcePaths) {
      const absoluteSourcePath = path.join(workspaceRoot, sourcePath);
      if (!fs.existsSync(absoluteSourcePath)) {
        failures.push(`${rule.docPath}:${lineIndex + 1}: inline source path does not exist: ${sourcePath}`);
        continue;
      }
      if (!sourceFileCache.has(sourcePath)) {
        sourceFileCache.set(sourcePath, fs.readFileSync(absoluteSourcePath, 'utf8'));
      }
    }

    if (hasIgnoreMarker(line)) continue;

    const symbols = tokens.filter((token) => !isSourceCodePathToken(token) && isCandidateIdentifierToken(token));
    if (symbols.length === 0) continue;

    for (const symbol of symbols) {
      const hit = sourcePaths.some((sourcePath) => {
        const source = sourceFileCache.get(sourcePath);
        return typeof source === 'string' && source.includes(symbol);
      });
      if (!hit) {
        failures.push(`${rule.docPath}:${lineIndex + 1}: symbol \`${symbol}\` not found in inline referenced source paths (${sourcePaths.join(', ')})`);
      }
    }
  }
}

for (const rule of docRules) {
  const absoluteDocPath = path.join(workspaceRoot, rule.docPath);
  const docSource = readFileSafe(absoluteDocPath);

  if (docSource === null) {
    failures.push(`Missing guarded architecture doc: ${rule.docPath}`);
    continue;
  }

  for (const forbidden of rule.forbiddenSymbolsInDoc) {
    if (docSource.includes(forbidden)) {
      failures.push(`${rule.docPath}: forbidden legacy symbol found: ${forbidden}`);
    }
  }

  assertRequiredPairs(rule, docSource);
  assertInlinePathAndSymbolParity(rule, docSource);
}

if (failures.length > 0) {
  console.error('[check-doc-code-symbol-parity] FAILED');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (!reportOnly) {
    process.exit(1);
  }
}

if (reportOnly) {
  console.log('[check-doc-code-symbol-parity] REPORT: scan completed.');
} else {
  console.log('[check-doc-code-symbol-parity] OK: architecture doc/code symbols are in parity.');
}