import { normalizeLocale, type Locale } from './index';
import type { CollaborationAssetRecord, CollaborationProjectSnapshotRecord, ProjectEntityType, ProjectChangeOperation } from '../collaboration/cloud/syncTypes';

export type CollaborationCloudPanelMessages = {
  title: string;
  entryLabel: string;
  subtitle: string;
  tabAssets: string;
  tabSnapshots: string;
  tabTimeline: string;
  tabDirectory: string;
  directoryMembersHeading: string;
  directoryProjectsHeading: string;
  refreshAssets: string;
  refreshSnapshots: string;
  refreshTimeline: string;
  refreshDirectory: string;
  loading: string;
  openAsset: string;
  removeAsset: string;
  restoreSnapshot: string;
  emptyAssets: string;
  emptySnapshots: string;
  emptyTimeline: string;
  assetTypeLabel: (assetType: CollaborationAssetRecord['assetType']) => string;
  snapshotVersionLabel: (version: number) => string;
  timelineRecordLabel: (opType: ProjectChangeOperation, entityType: ProjectEntityType, entityId: string) => string;
  sizeLabel: (sizeBytes: number) => string;
  createdAtLabel: (value: string) => string;
  changedAtLabel: (value: string) => string;
  loadFailed: (reason: string) => string;
  assetsLoaded: (count: number) => string;
  snapshotsLoaded: (count: number) => string;
  timelineLoaded: (count: number) => string;
  assetRemoved: (assetId: string) => string;
  snapshotRestored: (snapshot: CollaborationProjectSnapshotRecord) => string;
  emptyProjects: string;
  emptyMembers: string;
  projectsLoaded: (count: number) => string;
  membersLoaded: (count: number) => string;
  projectNameLabel: (name: string) => string;
  projectVisibilityLabel: (visibility: string) => string;
  projectUpdatedLabel: (value: string) => string;
  memberRoleLabel: (role: string) => string;
  memberUserLabel: (userId: string) => string;
  directoryHint: string;
  currentProjectHeading: (projectId: string) => string;
};

function formatReadableSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  if (sizeBytes < 1024) return `${Math.floor(sizeBytes)} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

const zhCN: CollaborationCloudPanelMessages = {
  title: '\u534f\u540c\u4e91\u5de5\u4f5c\u533a',
  entryLabel: '\u534f\u540c',
  subtitle: '\u8d44\u4ea7 / \u7248\u672c / \u6062\u590d / \u53d8\u66f4\u65f6\u95f4\u7ebf',
  tabAssets: '\u8d44\u4ea7\u5217\u8868',
  tabSnapshots: '\u7248\u672c\u5386\u53f2',
  tabTimeline: '\u53d8\u66f4\u65f6\u95f4\u7ebf',
  tabDirectory: '\u4e91\u9879\u76ee\u4e0e\u6210\u5458',
  directoryMembersHeading: '\u5f53\u524d\u9879\u76ee\u6210\u5458',
  directoryProjectsHeading: '\u53ef\u8bbf\u95ee\u7684\u4e91\u9879\u76ee',
  refreshAssets: '\u5237\u65b0\u8d44\u4ea7',
  refreshSnapshots: '\u5237\u65b0\u7248\u672c',
  refreshTimeline: '\u5237\u65b0\u65f6\u95f4\u7ebf',
  refreshDirectory: '\u5237\u65b0\u76ee\u5f55',
  loading: '\u52a0\u8f7d\u4e2d\u2026',
  openAsset: '\u6253\u5f00',
  removeAsset: '\u5220\u9664',
  restoreSnapshot: '\u6062\u590d\u5230\u672c\u5730',
  emptyAssets: '\u6682\u65e0\u8d44\u4ea7\u8bb0\u5f55\u3002',
  emptySnapshots: '\u6682\u65e0\u7248\u672c\u8bb0\u5f55\u3002',
  emptyTimeline: '\u6682\u65e0\u53d8\u66f4\u8bb0\u5f55\u3002',
  assetTypeLabel: (assetType) => {
    if (assetType === 'audio') return '\u97f3\u9891';
    if (assetType === 'export') return '\u5bfc\u51fa';
    return '\u9644\u4ef6';
  },
  snapshotVersionLabel: (version) => `\u7248\u672c v${version}`,
  timelineRecordLabel: (opType, entityType, entityId) => `${opType} \u00b7 ${entityType}:${entityId}`,
  sizeLabel: (sizeBytes) => `\u5927\u5c0f\uff1a${formatReadableSize(sizeBytes)}`,
  createdAtLabel: (value) => `\u521b\u5efa\u65f6\u95f4\uff1a${value}`,
  changedAtLabel: (value) => `\u53d8\u66f4\u65f6\u95f4\uff1a${value}`,
  loadFailed: (reason) => `\u52a0\u8f7d\u5931\u8d25\uff1a${reason}`,
  assetsLoaded: (count) => `\u5df2\u52a0\u8f7d ${count} \u6761\u8d44\u4ea7`,
  snapshotsLoaded: (count) => `\u5df2\u52a0\u8f7d ${count} \u6761\u7248\u672c`,
  timelineLoaded: (count) => `\u5df2\u52a0\u8f7d ${count} \u6761\u53d8\u66f4`,
  assetRemoved: (assetId) => `\u5df2\u5220\u9664\u8d44\u4ea7 ${assetId}`,
  snapshotRestored: (snapshot) => `\u5df2\u6062\u590d\u7248\u672c v${snapshot.version}`,
  emptyProjects: '\u6682\u65e0\u53ef\u8bbf\u95ee\u7684\u4e91\u9879\u76ee\u3002',
  emptyMembers: '\u6682\u65e0\u6210\u5458\u8bb0\u5f55\u3002',
  projectsLoaded: (count) => `\u5df2\u52a0\u8f7d ${count} \u4e2a\u4e91\u9879\u76ee`,
  membersLoaded: (count) => `\u5df2\u52a0\u8f7d ${count} \u4f4d\u6210\u5458`,
  projectNameLabel: (name) => `\u540d\u79f0\uff1a${name}`,
  projectVisibilityLabel: (visibility) => `\u53ef\u89c1\u6027\uff1a${visibility}`,
  projectUpdatedLabel: (value) => `\u66f4\u65b0\uff1a${value}`,
  memberRoleLabel: (role) => `\u89d2\u8272\uff1a${role}`,
  memberUserLabel: (userId) => `\u7528\u6237\uff1a${userId}`,
  directoryHint: '\u5217\u8868\u4ec5\u5305\u542b\u5f53\u524d\u8d26\u53f7\u5728 RLS \u4e0b\u53ef\u8bfb\u7684\u9879\u76ee\u3002\u9080\u8bf7\u4e0e\u89d2\u8272\u5206\u914d\u8bf7\u5728 Supabase \u6216\u540e\u7eed\u7ba1\u7406\u754c\u9762\u5b8c\u6210\u3002',
  currentProjectHeading: (projectId) => `\u5f53\u524d\u9879\u76ee ID\uff1a${projectId}`,
};

const enUS: CollaborationCloudPanelMessages = {
  title: 'Collaboration Cloud Workspace',
  entryLabel: 'Cloud',
  subtitle: 'Assets / Versions / Restore / Change Timeline',
  tabAssets: 'Assets',
  tabSnapshots: 'Versions',
  tabTimeline: 'Timeline',
  tabDirectory: 'Cloud projects',
  directoryMembersHeading: 'Members in this project',
  directoryProjectsHeading: 'Cloud projects you can access',
  refreshAssets: 'Refresh Assets',
  refreshSnapshots: 'Refresh Versions',
  refreshTimeline: 'Refresh Timeline',
  refreshDirectory: 'Refresh directory',
  loading: 'Loading...',
  openAsset: 'Open',
  removeAsset: 'Remove',
  restoreSnapshot: 'Restore To Local',
  emptyAssets: 'No assets found.',
  emptySnapshots: 'No snapshot history found.',
  emptyTimeline: 'No change records found.',
  assetTypeLabel: (assetType) => {
    if (assetType === 'audio') return 'Audio';
    if (assetType === 'export') return 'Export';
    return 'Attachment';
  },
  snapshotVersionLabel: (version) => `Version v${version}`,
  timelineRecordLabel: (opType, entityType, entityId) => `${opType} · ${entityType}:${entityId}`,
  sizeLabel: (sizeBytes) => `Size: ${formatReadableSize(sizeBytes)}`,
  createdAtLabel: (value) => `Created: ${value}`,
  changedAtLabel: (value) => `Changed: ${value}`,
  loadFailed: (reason) => `Load failed: ${reason}`,
  assetsLoaded: (count) => `Loaded ${count} assets`,
  snapshotsLoaded: (count) => `Loaded ${count} versions`,
  timelineLoaded: (count) => `Loaded ${count} timeline events`,
  assetRemoved: (assetId) => `Removed asset ${assetId}`,
  snapshotRestored: (snapshot) => `Restored version v${snapshot.version}`,
  emptyProjects: 'No cloud projects visible for this account.',
  emptyMembers: 'No member rows for this project.',
  projectsLoaded: (count) => `Loaded ${count} cloud projects`,
  membersLoaded: (count) => `Loaded ${count} members`,
  projectNameLabel: (name) => `Name: ${name}`,
  projectVisibilityLabel: (visibility) => `Visibility: ${visibility}`,
  projectUpdatedLabel: (value) => `Updated: ${value}`,
  memberRoleLabel: (role) => `Role: ${role}`,
  memberUserLabel: (userId) => `User: ${userId}`,
  directoryHint: 'This list follows Supabase RLS for your account. Invites and role changes are handled in Supabase or a future admin UI.',
  currentProjectHeading: (projectId) => `Current project id: ${projectId}`,
};

export function getCollaborationCloudPanelMessages(locale: Locale): CollaborationCloudPanelMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}