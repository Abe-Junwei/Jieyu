import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/collaborationConflictRuntime.ts',
  'src/collaboration/collaborationConflictRuntime.test.ts',
  'scripts/report-m8-collaboration-rc.mjs',
  'docs/execution/plans/M8-执行记录-2026-04-13.md',
  'docs/execution/plans/M8-协作三段式演进图-2026-04-13.md',
  'docs/execution/release-gates/M8-协作演进RC门禁清单-2026-04-13.md',
];

const requiredSnippets = [
  'detectCollaborationConflicts',
  'resolveCollaborationConflicts',
  'evaluateResolutionConsistency',
  'computeCollaborationDigest',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m8-collaboration-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(
  path.resolve(root, 'src/collaboration/collaborationConflictRuntime.ts'),
  'utf8',
);
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m8-collaboration-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m8-collaboration-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
