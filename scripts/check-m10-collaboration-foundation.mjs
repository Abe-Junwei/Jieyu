import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/collaborationBetaRuntime.ts',
  'src/collaboration/collaborationBetaRuntime.test.ts',
  'scripts/report-m10-collaboration-beta-gate.mjs',
  'docs/execution/plans/M10-协作可用化-2026-04-13.md',
  'docs/execution/archive/milestone-records/M10-执行记录-2026-04-13.md',
  'docs/execution/release-gates/M10-协作可用化门禁清单-2026-04-13.md',
];

const requiredSnippets = [
  'applyMultiLayerBatchEdits',
  'planBatchProcessing',
  'buildCollaboratorHints',
  'evaluateContinuousEditingStability',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m10-collaboration-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(
  path.resolve(root, 'src/collaboration/collaborationBetaRuntime.ts'),
  'utf8',
);
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m10-collaboration-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m10-collaboration-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
