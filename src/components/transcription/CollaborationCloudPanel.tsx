import { useCallback, useMemo, useState } from 'react';
import type {
  CollaborationAssetRecord,
  CollaborationProjectChangeRecord,
  CollaborationProjectSnapshotRecord,
  ProjectChangeOperation,
  ProjectEntityType,
} from '../../collaboration/cloud/syncTypes';
import type { ChangeTimelineResult } from '../../collaboration/cloud/CollaborationAuditLogService';
import type {
  CollaborationCloudDirectoryMember,
  CollaborationCloudDirectoryProject,
} from '../../collaboration/cloud/collaborationSyncDerived';
import { useLocale } from '../../i18n';
import { getCollaborationCloudPanelMessages } from '../../i18n/collaborationCloudPanelMessages';
import '../../styles/collaboration-sync-surface.css';

type CloudPanelTab = 'assets' | 'snapshots' | 'timeline' | 'directory';

interface CollaborationCloudPanelProps {
  listProjectAssets: (input?: {
    assetType?: CollaborationAssetRecord['assetType'];
    limit?: number;
    offset?: number;
  }) => Promise<CollaborationAssetRecord[]>;
  removeProjectAsset: (assetId: string) => Promise<void>;
  getProjectAssetSignedUrl: (
    asset: Pick<CollaborationAssetRecord, 'storageBucket' | 'storagePath'>,
    expiresInSeconds?: number,
  ) => Promise<string>;
  listProjectSnapshots: (input?: {
    limit?: number;
    offset?: number;
  }) => Promise<CollaborationProjectSnapshotRecord[]>;
  restoreProjectSnapshotToLocalById: (snapshotId: string) => Promise<CollaborationProjectSnapshotRecord>;
  queryProjectChangeTimeline: (input?: {
    entityType?: ProjectEntityType;
    opType?: ProjectChangeOperation;
    actorId?: string;
    entityId?: string;
    since?: string;
    until?: string;
    sinceRevision?: number;
    limit?: number;
    offset?: number;
  }) => Promise<ChangeTimelineResult>;
  directory?: {
    workspaceProjectId: string;
    listAccessibleProjects: () => Promise<CollaborationCloudDirectoryProject[]>;
    listProjectMembers: (projectId: string) => Promise<CollaborationCloudDirectoryMember[]>;
  };
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  return 'unknown-error';
}

export function CollaborationCloudPanel({
  listProjectAssets,
  removeProjectAsset,
  getProjectAssetSignedUrl,
  listProjectSnapshots,
  restoreProjectSnapshotToLocalById,
  queryProjectChangeTimeline,
  directory,
}: CollaborationCloudPanelProps) {
  const locale = useLocale();
  const messages = getCollaborationCloudPanelMessages(locale);

  const [activeTab, setActiveTab] = useState<CloudPanelTab>('assets');
  const [assets, setAssets] = useState<CollaborationAssetRecord[]>([]);
  const [snapshots, setSnapshots] = useState<CollaborationProjectSnapshotRecord[]>([]);
  const [timeline, setTimeline] = useState<CollaborationProjectChangeRecord[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CollaborationCloudDirectoryProject[]>([]);
  const [cloudMembers, setCloudMembers] = useState<CollaborationCloudDirectoryMember[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const clearFeedback = useCallback(() => {
    setStatusMessage('');
    setErrorMessage('');
  }, []);

  const refreshAssets = useCallback(async () => {
    clearFeedback();
    setIsBusy(true);
    try {
      const rows = await listProjectAssets({ limit: 20, offset: 0 });
      setAssets(rows);
      setStatusMessage(messages.assetsLoaded(rows.length));
    } catch (error) {
      setErrorMessage(messages.loadFailed(normalizeErrorMessage(error)));
    } finally {
      setIsBusy(false);
    }
  }, [clearFeedback, listProjectAssets, messages]);

  const refreshSnapshots = useCallback(async () => {
    clearFeedback();
    setIsBusy(true);
    try {
      const rows = await listProjectSnapshots({ limit: 20, offset: 0 });
      setSnapshots(rows);
      setStatusMessage(messages.snapshotsLoaded(rows.length));
    } catch (error) {
      setErrorMessage(messages.loadFailed(normalizeErrorMessage(error)));
    } finally {
      setIsBusy(false);
    }
  }, [clearFeedback, listProjectSnapshots, messages]);

  const refreshTimeline = useCallback(async () => {
    clearFeedback();
    setIsBusy(true);
    try {
      const result = await queryProjectChangeTimeline({ limit: 50, offset: 0 });
      setTimeline(result.changes);
      setStatusMessage(messages.timelineLoaded(result.changes.length));
    } catch (error) {
      setErrorMessage(messages.loadFailed(normalizeErrorMessage(error)));
    } finally {
      setIsBusy(false);
    }
  }, [clearFeedback, messages, queryProjectChangeTimeline]);

  const refreshDirectory = useCallback(async () => {
    if (!directory) return;
    clearFeedback();
    setIsBusy(true);
    try {
      const projects = await directory.listAccessibleProjects();
      setCloudProjects(projects);
      const members = await directory.listProjectMembers(directory.workspaceProjectId);
      setCloudMembers(members);
      setStatusMessage(
        `${messages.projectsLoaded(projects.length)} · ${messages.membersLoaded(members.length)}`,
      );
    } catch (error) {
      setErrorMessage(messages.loadFailed(normalizeErrorMessage(error)));
    } finally {
      setIsBusy(false);
    }
  }, [clearFeedback, directory, messages]);

  const handleOpenAsset = useCallback(async (asset: CollaborationAssetRecord) => {
    clearFeedback();
    setIsBusy(true);
    try {
      const url = await getProjectAssetSignedUrl({
        storageBucket: asset.storageBucket,
        storagePath: asset.storagePath,
      });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setErrorMessage(messages.loadFailed(normalizeErrorMessage(error)));
    } finally {
      setIsBusy(false);
    }
  }, [clearFeedback, getProjectAssetSignedUrl, messages]);

  const handleRemoveAsset = useCallback(async (asset: CollaborationAssetRecord) => {
    clearFeedback();
    setIsBusy(true);
    try {
      await removeProjectAsset(asset.id);
      setStatusMessage(messages.assetRemoved(asset.id));
      const rows = await listProjectAssets({ limit: 20, offset: 0 });
      setAssets(rows);
    } catch (error) {
      setErrorMessage(messages.loadFailed(normalizeErrorMessage(error)));
    } finally {
      setIsBusy(false);
    }
  }, [clearFeedback, listProjectAssets, messages, removeProjectAsset]);

  const handleRestoreSnapshot = useCallback(async (snapshotId: string) => {
    clearFeedback();
    setIsBusy(true);
    try {
      const restored = await restoreProjectSnapshotToLocalById(snapshotId);
      setStatusMessage(messages.snapshotRestored(restored));
    } catch (error) {
      setErrorMessage(messages.loadFailed(normalizeErrorMessage(error)));
    } finally {
      setIsBusy(false);
    }
  }, [clearFeedback, messages, restoreProjectSnapshotToLocalById]);

  const currentRefreshLabel = useMemo(() => {
    if (activeTab === 'assets') return messages.refreshAssets;
    if (activeTab === 'snapshots') return messages.refreshSnapshots;
    if (activeTab === 'directory') return messages.refreshDirectory;
    return messages.refreshTimeline;
  }, [activeTab, messages]);

  const handleRefreshCurrentTab = useCallback(async () => {
    if (activeTab === 'assets') {
      await refreshAssets();
      return;
    }
    if (activeTab === 'snapshots') {
      await refreshSnapshots();
      return;
    }
    if (activeTab === 'directory') {
      await refreshDirectory();
      return;
    }
    await refreshTimeline();
  }, [activeTab, refreshAssets, refreshDirectory, refreshSnapshots, refreshTimeline]);

  return (
    <section className="app-side-pane-group app-side-pane-layer-group app-side-pane-collaboration-group" aria-label={messages.title}>
      <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
        <div className="app-side-pane-collaboration-title-wrap">
          <span className="app-side-pane-section-title">{messages.title}</span>
          <span className="app-side-pane-collaboration-subtitle">{messages.subtitle}</span>
        </div>
      </div>

      <div className="app-side-pane-nav app-side-pane-collaboration-wrap">
        <div className="app-side-pane-collaboration-tabs" role="tablist" aria-label={messages.title}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'assets'}
            className={`app-side-pane-collaboration-tab ${activeTab === 'assets' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            {messages.tabAssets}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'snapshots'}
            className={`app-side-pane-collaboration-tab ${activeTab === 'snapshots' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('snapshots')}
          >
            {messages.tabSnapshots}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'timeline'}
            className={`app-side-pane-collaboration-tab ${activeTab === 'timeline' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            {messages.tabTimeline}
          </button>
          {directory ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'directory'}
              className={`app-side-pane-collaboration-tab ${activeTab === 'directory' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('directory')}
            >
              {messages.tabDirectory}
            </button>
          ) : null}
        </div>

        <div className="app-side-pane-collaboration-actions">
          <button
            type="button"
            className="btn btn-ghost app-side-pane-collaboration-refresh"
            disabled={isBusy}
            onClick={() => {
              void handleRefreshCurrentTab();
            }}
          >
            {isBusy ? messages.loading : currentRefreshLabel}
          </button>
        </div>

        {statusMessage ? <p className="app-side-pane-collaboration-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="app-side-pane-collaboration-error">{errorMessage}</p> : null}

        {activeTab === 'assets' ? (
          <ul className="app-side-pane-collaboration-list">
            {assets.length === 0 ? <li className="app-side-pane-collaboration-empty">{messages.emptyAssets}</li> : null}
            {assets.map((asset) => (
              <li key={asset.id} className="app-side-pane-collaboration-item">
                <div className="app-side-pane-collaboration-item-main">
                  <strong>{messages.assetTypeLabel(asset.assetType)}</strong>
                  <span>{messages.sizeLabel(asset.sizeBytes)}</span>
                  <span>{messages.createdAtLabel(formatDateTime(asset.createdAt))}</span>
                </div>
                <div className="app-side-pane-collaboration-item-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isBusy}
                    onClick={() => {
                      void handleOpenAsset(asset);
                    }}
                  >
                    {messages.openAsset}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isBusy}
                    onClick={() => {
                      void handleRemoveAsset(asset);
                    }}
                  >
                    {messages.removeAsset}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {activeTab === 'snapshots' ? (
          <ul className="app-side-pane-collaboration-list">
            {snapshots.length === 0 ? <li className="app-side-pane-collaboration-empty">{messages.emptySnapshots}</li> : null}
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="app-side-pane-collaboration-item">
                <div className="app-side-pane-collaboration-item-main">
                  <strong>{messages.snapshotVersionLabel(snapshot.version)}</strong>
                  <span>{messages.createdAtLabel(formatDateTime(snapshot.createdAt))}</span>
                </div>
                <div className="app-side-pane-collaboration-item-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isBusy}
                    onClick={() => {
                      void handleRestoreSnapshot(snapshot.id);
                    }}
                  >
                    {messages.restoreSnapshot}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {activeTab === 'timeline' ? (
          <ul className="app-side-pane-collaboration-list">
            {timeline.length === 0 ? <li className="app-side-pane-collaboration-empty">{messages.emptyTimeline}</li> : null}
            {timeline.map((change) => (
              <li key={change.id} className="app-side-pane-collaboration-item">
                <div className="app-side-pane-collaboration-item-main">
                  <strong>{messages.timelineRecordLabel(change.opType, change.entityType, change.entityId)}</strong>
                  <span>{messages.changedAtLabel(formatDateTime(change.createdAt))}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {activeTab === 'directory' && directory ? (
          <div className="app-side-pane-collaboration-directory">
            <p className="app-side-pane-collaboration-directory-hint">{messages.directoryHint}</p>
            <p className="app-side-pane-collaboration-directory-current">
              {messages.currentProjectHeading(directory.workspaceProjectId)}
            </p>
            <h4 className="app-side-pane-collaboration-subheading">{messages.directoryProjectsHeading}</h4>
            <ul className="app-side-pane-collaboration-list">
              {cloudProjects.length === 0 ? <li className="app-side-pane-collaboration-empty">{messages.emptyProjects}</li> : null}
              {cloudProjects.map((project) => (
                <li key={project.id} className="app-side-pane-collaboration-item">
                  <div className="app-side-pane-collaboration-item-main">
                    <strong>{messages.projectNameLabel(project.name || project.id)}</strong>
                    <span>{messages.projectVisibilityLabel(project.visibility)}</span>
                    <span>{messages.projectUpdatedLabel(formatDateTime(project.updatedAt))}</span>
                  </div>
                </li>
              ))}
            </ul>
            <h4 className="app-side-pane-collaboration-subheading">{messages.directoryMembersHeading}</h4>
            <ul className="app-side-pane-collaboration-list">
              {cloudMembers.length === 0 ? <li className="app-side-pane-collaboration-empty">{messages.emptyMembers}</li> : null}
              {cloudMembers.map((member) => (
                <li key={`${member.userId}:${member.joinedAt}`} className="app-side-pane-collaboration-item">
                  <div className="app-side-pane-collaboration-item-main">
                    <strong>{messages.memberUserLabel(member.userId)}</strong>
                    <span>{messages.memberRoleLabel(member.role)}</span>
                    {member.disabledAt ? <span>{formatDateTime(member.disabledAt)}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}