import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/collaborationPromotionRuntime.ts',
  'src/collaboration/collaborationPromotionRuntime.test.ts',
  'scripts/report-m14-collaboration-promotion-gate.mjs',
  'docs/execution/plans/M14-协作生产放行治理-2026-04-14.md',
  'docs/execution/plans/M14-执行记录-2026-04-14.md',
  'docs/execution/release-gates/M14-协作生产放行门禁清单-2026-04-14.md',
];

const requiredSnippets = [
  'collectPhaseGateStatuses',
  'evaluatePromotionReadiness',
  'determinePromotionStage',
  'buildRollbackWatchlist',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m14-collaboration-promotion-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(
  path.resolve(root, 'src/collaboration/collaborationPromotionRuntime.ts'),
  'utf8',
);
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m14-collaboration-promotion-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m14-collaboration-promotion-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
