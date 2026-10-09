/**
 * 首页“已从本机移除的云端项目”列表：只能手动重新下载（rev5 9.1）。
 * Home list of cloud projects removed from this device; re-download is manual only (rev5 9.1).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  listRemovedCloudProjects,
  redownloadRemovedCloudProject,
  type RedownloadOutcome,
  type RemovedCloudProjectEntry,
} from '../app/projectRemovalFlow';
import { t, tf, type DictKey, type Locale } from '../i18n';

const REASON_KEYS: Record<Exclude<RedownloadOutcome, { ok: true }>['reason'], DictKey | null> = {
  'cloud-not-configured': 'app.home.removedCloudProjects.reason.cloudNotConfigured',
  'project-not-found': 'app.home.removedCloudProjects.reason.projectNotFound',
  'project-deleted': 'app.home.removedCloudProjects.reason.projectDeleted',
  'no-snapshot': 'app.home.removedCloudProjects.reason.noSnapshot',
  other: null,
};

interface RemovedCloudProjectsSectionProps {
  locale: Locale;
  /** 变化时重新读取列表 | Re-read the list when this changes */
  refreshToken: number;
  onRedownloaded: (projectId: string) => void;
}

export function RemovedCloudProjectsSection({
  locale,
  refreshToken,
  onRedownloaded,
}: RemovedCloudProjectsSectionProps) {
  const [entries, setEntries] = useState<RemovedCloudProjectEntry[]>(() =>
    listRemovedCloudProjects(),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setEntries(listRemovedCloudProjects());
  }, [refreshToken]);

  const redownload = useCallback(
    async (projectId: string) => {
      setBusyId(projectId);
      setFailure(null);
      const outcome = await redownloadRemovedCloudProject(projectId);
      setBusyId(null);
      setEntries(listRemovedCloudProjects());
      if (outcome.ok) {
        onRedownloaded(projectId);
        return;
      }
      const reasonKey = REASON_KEYS[outcome.reason];
      const message = reasonKey !== null ? t(locale, reasonKey) : outcome.message;
      setFailure(tf(locale, 'app.home.removedCloudProjects.failed', { message }));
    },
    [locale, onRedownloaded],
  );

  if (entries.length === 0) return null;
  return (
    <section
      className="home-removed-cloud-projects"
      aria-label={t(locale, 'app.home.removedCloudProjects.title')}
      data-testid="removed-cloud-projects"
    >
      <h3 className="home-project-row-title">{t(locale, 'app.home.removedCloudProjects.title')}</h3>
      <p className="home-project-row-time">{t(locale, 'app.home.removedCloudProjects.hint')}</p>
      {failure !== null ? (
        <div className="home-page-error" role="alert">
          {failure}
        </div>
      ) : null}
      {entries.map((entry) => (
        <div key={entry.projectId} className="home-project-row">
          <span className="home-project-row-main">
            <span className="home-project-row-title">
              {entry.projectName ?? t(locale, 'app.home.removedCloudProjects.unnamed')}
            </span>
          </span>
          <button
            type="button"
            className="btn"
            disabled={busyId !== null}
            onClick={() => void redownload(entry.projectId)}
          >
            {busyId === entry.projectId
              ? t(locale, 'app.home.removedCloudProjects.redownloading')
              : t(locale, 'app.home.removedCloudProjects.redownload')}
          </button>
        </div>
      ))}
    </section>
  );
}
