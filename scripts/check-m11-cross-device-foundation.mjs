import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/collaborationCrossDeviceRuntime.ts',
  'src/collaboration/collaborationCrossDeviceRuntime.test.ts',
  'scripts/report-m11-cross-device-gate.mjs',
  'docs/execution/plans/M11-跨设备协作治理-2026-04-13.md',
  'docs/execution/archive/milestone-records/M11-执行记录-2026-04-13.md',
  'docs/execution/release-gates/M11-跨设备协作门禁清单-2026-04-13.md',
];

const requiredSnippets = [
  'compareVectorClock',
  'assessClockDrift',
  'mergeCrossDeviceReplicas',
  'validateCrossDeviceConsistency',
  'createCrossDeviceRollbackPlan',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m11-cross-device-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(
  path.resolve(root, 'src/collaboration/collaborationCrossDeviceRuntime.ts'),
  'utf8',
);
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m11-cross-device-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m11-cross-device-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
