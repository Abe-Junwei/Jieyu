import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/collaborationRulesRuntime.ts',
  'src/collaboration/collaborationRulesRuntime.test.ts',
  'scripts/report-m9-collaboration-recovery-gate.mjs',
  'docs/execution/plans/M9-协作规则与恢复机制-2026-04-13.md',
  'docs/execution/archive/milestone-records/M9-执行记录-2026-04-13.md',
  'docs/execution/release-gates/M9-协作规则与恢复门禁清单-2026-04-13.md',
];

const requiredSnippets = [
  'prioritizeConflicts',
  'openArbitrationTicket',
  'appendOperationLog',
  'validateReconnectConsistency',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m9-collaboration-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(
  path.resolve(root, 'src/collaboration/collaborationRulesRuntime.ts'),
  'utf8',
);
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m9-collaboration-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m9-collaboration-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
