import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/collaborationMultiReplicaRuntime.ts',
  'src/collaboration/collaborationMultiReplicaRuntime.test.ts',
  'scripts/report-m12-multi-replica-gate.mjs',
  'docs/execution/plans/M12-多副本批量同步治理-2026-04-13.md',
  'docs/execution/archive/milestone-records/M12-执行记录-2026-04-13.md',
  'docs/execution/release-gates/M12-多副本批量同步门禁清单-2026-04-13.md',
];

const requiredSnippets = [
  'planReplicaSyncChunks',
  'evaluateReplicaQuorum',
  'mergeReplicaBatch',
  'createBatchRollbackPlan',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m12-multi-replica-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(
  path.resolve(root, 'src/collaboration/collaborationMultiReplicaRuntime.ts'),
  'utf8',
);
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m12-multi-replica-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m12-multi-replica-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
