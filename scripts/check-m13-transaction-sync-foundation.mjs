import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/collaborationTransactionSyncRuntime.ts',
  'src/collaboration/collaborationTransactionSyncRuntime.test.ts',
  'scripts/report-m13-transaction-sync-gate.mjs',
  'docs/execution/plans/M13-跨实体事务同步治理-2026-04-13.md',
  'docs/execution/plans/M13-执行记录-2026-04-13.md',
  'docs/execution/release-gates/M13-跨实体事务同步门禁清单-2026-04-13.md',
];

const requiredSnippets = [
  'planTransactionSyncChunks',
  'evaluateTransactionAtomicity',
  'executeTransactionalReplicaSync',
  'createTransactionalRollbackPlan',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m13-transaction-sync-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(
  path.resolve(root, 'src/collaboration/collaborationTransactionSyncRuntime.ts'),
  'utf8',
);
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m13-transaction-sync-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m13-transaction-sync-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
