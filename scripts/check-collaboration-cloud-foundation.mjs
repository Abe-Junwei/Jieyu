import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/collaboration/cloud/collaborationProtocolGuard.ts',
  'src/collaboration/cloud/collaborationSupabaseFacade.ts',
  'src/collaboration/cloud/realtimeSubscription.ts',
  'src/collaboration/cloud/CollaborationDirectoryService.ts',
  'src/collaboration/cloud/collaborationSyncDerived.ts',
  'src/collaboration/cloud/CollaborationSyncBridge.ts',
  'src/collaboration/cloud/CollaborationAssetService.ts',
  'src/collaboration/cloud/CollaborationSnapshotService.ts',
  'src/collaboration/cloud/CollaborationAuditLogService.ts',
  'src/collaboration/cloud/projectChangeRowParse.ts',
  'src/hooks/useTranscriptionCollaborationBridge.ts',
  'src/hooks/useTranscriptionCloudSyncActions.ts',
  'src/components/transcription/CollaborationCloudPanel.tsx',
  'supabase/sql/001_collaboration_foundation.sql',
  'docs/execution/plans/托管实时协同-Supabase完整落地方案-2026-04-17.md',
  'scripts/report-collaboration-cloud-gate.mjs',
];

const runtimeContracts = [
  {
    filePath: 'src/collaboration/cloud/collaborationProtocolGuard.ts',
    snippets: ['evaluateCollaborationProtocolGuard', 'SUPPORTED_COLLABORATION_PROTOCOL_VERSION'],
  },
  {
    filePath: 'src/collaboration/cloud/collaborationSyncDerived.ts',
    snippets: ['deriveCollaborationSyncBadge', 'CollaborationCloudDirectoryProject'],
  },
  {
    filePath: 'src/collaboration/cloud/CollaborationSyncBridge.ts',
    snippets: ['onOutboundPendingSizeChanged', 'registerProjectAsset', 'createProjectSnapshot', 'queryProjectChangeTimeline'],
  },
  {
    filePath: 'src/hooks/useTranscriptionCollaborationBridge.ts',
    snippets: ['collaborationOutboundPendingCount', 'collaborationProtocolGuard', 'evaluateCollaborationProtocolGuard'],
  },
  {
    filePath: 'src/hooks/useTranscriptionCloudSyncActions.ts',
    snippets: ['collaborationSyncBadge', 'collaborationProtocolGuard', 'restoreProjectSnapshotToLocalById', 'queryProjectChangeTimeline'],
  },
  {
    filePath: 'src/components/transcription/CollaborationCloudPanel.tsx',
    snippets: ['refreshAssets', 'refreshSnapshots', 'refreshTimeline'],
  },
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-collaboration-cloud-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const missingContracts = [];
for (const contract of runtimeContracts) {
  const source = readFileSync(path.resolve(root, contract.filePath), 'utf8');
  for (const snippet of contract.snippets) {
    if (!source.includes(snippet)) {
      missingContracts.push(`${contract.filePath} -> ${snippet}`);
    }
  }
}

if (missingContracts.length > 0) {
  console.error('[check-collaboration-cloud-foundation] Missing required runtime contracts:');
  for (const item of missingContracts) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(
  `[check-collaboration-cloud-foundation] OK: ${requiredFiles.length} required files and ${runtimeContracts.reduce((sum, item) => sum + item.snippets.length, 0)} runtime contracts.`,
);
