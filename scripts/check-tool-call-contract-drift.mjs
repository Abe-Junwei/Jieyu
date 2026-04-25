import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const sourceFilePath = path.resolve(repoRoot, 'src/ai/chat/toolCallSchemas.ts');
const snapshotFilePath = path.resolve(repoRoot, 'docs/execution/audits/tool-call-contract.snapshot.json');

function extractToolNamesFromBlock(source, blockStartRegex) {
  const startMatch = source.match(blockStartRegex);
  if (!startMatch || startMatch.index == null) {
    return [];
  }

  const startIndex = startMatch.index + startMatch[0].length;
  const tail = source.slice(startIndex);
  const endIndex = tail.indexOf('\n} as const');
  if (endIndex < 0) {
    return [];
  }

  const block = tail.slice(0, endIndex);
  return Array.from(
    new Set(
      [...block.matchAll(/^\s{2}([a-z_]+):/gm)]
        .map((m) => m[1])
        .filter((name) => typeof name === 'string' && name.length > 0),
    ),
  ).sort();
}

function extractParserToolNames(source) {
  const parserConstRegex = /const AI_CHAT_TOOL_NAMES_FROM_PARSER = \[(?<items>[\s\S]*?)\] as const satisfies/s;
  const match = source.match(parserConstRegex);
  if (!match?.groups?.items) {
    return [];
  }
  return Array.from(
    new Set(
      [...match.groups.items.matchAll(/'([a-z_]+)'/g)]
        .map((m) => m[1])
        .filter((name) => typeof name === 'string' && name.length > 0),
    ),
  ).sort();
}

function buildSnapshot() {
  const source = fs.readFileSync(sourceFilePath, 'utf8');
  const schemaToolNames = extractToolNamesFromBlock(source, /export const toolArgumentSchemas = \{/);
  const parserToolNames = extractParserToolNames(source);

  const schemaOnlyToolNames = schemaToolNames.filter((name) => !parserToolNames.includes(name));
  const parserOnlyToolNames = parserToolNames.filter((name) => !schemaToolNames.includes(name));

  return {
    version: 1,
    source: {
      toolSchemas: path.relative(repoRoot, sourceFilePath),
    },
    contract: {
      schemaToolNames,
      parserToolNames,
      schemaOnlyToolNames,
      parserOnlyToolNames,
      isNameSetAligned: schemaOnlyToolNames.length === 0 && parserOnlyToolNames.length === 0,
    },
  };
}

function main() {
  if (!fs.existsSync(snapshotFilePath)) {
    process.stderr.write(
      `tool-call contract snapshot missing: ${path.relative(repoRoot, snapshotFilePath)}\n` +
      'run `npm run export:tool-call-contract` first\n',
    );
    process.exit(1);
  }

  const current = buildSnapshot();
  const baseline = JSON.parse(fs.readFileSync(snapshotFilePath, 'utf8'));
  const currentJson = JSON.stringify(current, null, 2);
  const baselineJson = JSON.stringify(baseline, null, 2);

  if (currentJson === baselineJson) {
    process.stdout.write('tool-call contract drift check passed\n');
    return;
  }

  process.stderr.write('tool-call contract drift detected\n');
  process.stderr.write('run `npm run export:tool-call-contract` to refresh snapshot\n');
  process.stderr.write('--- baseline\n');
  process.stderr.write(`${baselineJson}\n`);
  process.stderr.write('--- current\n');
  process.stderr.write(`${currentJson}\n`);
  process.exit(1);
}

main();
