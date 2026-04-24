import { normalizeLocale, type Locale } from './index';
import { formatCatalogTemplate, readMessageCatalog } from './messageCatalog';
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

type CollaborationCloudPanelCatalog = Omit<
  CollaborationCloudPanelMessages,
  | 'assetTypeLabel'
  | 'snapshotVersionLabel'
  | 'timelineRecordLabel'
  | 'sizeLabel'
  | 'createdAtLabel'
  | 'changedAtLabel'
  | 'loadFailed'
  | 'assetsLoaded'
  | 'snapshotsLoaded'
  | 'timelineLoaded'
  | 'assetRemoved'
  | 'snapshotRestored'
  | 'projectsLoaded'
  | 'membersLoaded'
  | 'projectNameLabel'
  | 'projectVisibilityLabel'
  | 'projectUpdatedLabel'
  | 'memberRoleLabel'
  | 'memberUserLabel'
  | 'currentProjectHeading'
> & {
  assetTypeAudio: string;
  assetTypeExport: string;
  assetTypeAttachment: string;
  snapshotVersionLabel: string;
  timelineRecordLabel: string;
  sizeLabel: string;
  createdAtLabel: string;
  changedAtLabel: string;
  loadFailed: string;
  assetsLoaded: string;
  snapshotsLoaded: string;
  timelineLoaded: string;
  assetRemoved: string;
  snapshotRestored: string;
  projectsLoaded: string;
  membersLoaded: string;
  projectNameLabel: string;
  projectVisibilityLabel: string;
  projectUpdatedLabel: string;
  memberRoleLabel: string;
  memberUserLabel: string;
  currentProjectHeading: string;
};

export function getCollaborationCloudPanelMessages(locale: Locale): CollaborationCloudPanelMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  const {
    assetTypeAudio,
    assetTypeExport,
    assetTypeAttachment,
    snapshotVersionLabel,
    timelineRecordLabel,
    sizeLabel,
    createdAtLabel,
    changedAtLabel,
    loadFailed,
    assetsLoaded,
    snapshotsLoaded,
    timelineLoaded,
    assetRemoved,
    snapshotRestored,
    projectsLoaded,
    membersLoaded,
    projectNameLabel,
    projectVisibilityLabel,
    projectUpdatedLabel,
    memberRoleLabel,
    memberUserLabel,
    currentProjectHeading,
    ...rest
  } = readMessageCatalog<CollaborationCloudPanelCatalog>(normalizedLocale, 'msg.collabCloud.catalog');
  return {
    ...rest,
    assetTypeLabel: (assetType) => {
      if (assetType === 'audio') return assetTypeAudio;
      if (assetType === 'export') return assetTypeExport;
      return assetTypeAttachment;
    },
    snapshotVersionLabel: (version) => formatCatalogTemplate(snapshotVersionLabel, { version }),
    timelineRecordLabel: (opType, entityType, entityId) => formatCatalogTemplate(timelineRecordLabel, { opType, entityType, entityId }),
    sizeLabel: (sizeBytes) => formatCatalogTemplate(sizeLabel, { size: formatReadableSize(sizeBytes) }),
    createdAtLabel: (value) => formatCatalogTemplate(createdAtLabel, { value }),
    changedAtLabel: (value) => formatCatalogTemplate(changedAtLabel, { value }),
    loadFailed: (reason) => formatCatalogTemplate(loadFailed, { reason }),
    assetsLoaded: (count) => formatCatalogTemplate(assetsLoaded, { count }),
    snapshotsLoaded: (count) => formatCatalogTemplate(snapshotsLoaded, { count }),
    timelineLoaded: (count) => formatCatalogTemplate(timelineLoaded, { count }),
    assetRemoved: (assetId) => formatCatalogTemplate(assetRemoved, { assetId }),
    snapshotRestored: (snapshot) => formatCatalogTemplate(snapshotRestored, { version: snapshot.version }),
    projectsLoaded: (count) => formatCatalogTemplate(projectsLoaded, { count }),
    membersLoaded: (count) => formatCatalogTemplate(membersLoaded, { count }),
    projectNameLabel: (name) => formatCatalogTemplate(projectNameLabel, { name }),
    projectVisibilityLabel: (visibility) => formatCatalogTemplate(projectVisibilityLabel, { visibility }),
    projectUpdatedLabel: (value) => formatCatalogTemplate(projectUpdatedLabel, { value }),
    memberRoleLabel: (role) => formatCatalogTemplate(memberRoleLabel, { role }),
    memberUserLabel: (userId) => formatCatalogTemplate(memberUserLabel, { userId }),
    currentProjectHeading: (projectId) => formatCatalogTemplate(currentProjectHeading, { projectId }),
  };
}