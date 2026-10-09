/**
 * 从快照恢复（用户决定 2026-10-09）：列出覆盖前快照与整库快照（时间、项目、大小），预览，二次确认
 * 后恢复，写完读回核对。恢复前当前状态另存一份快照，本机字节不会丢（会丢就拒绝）。
 * Restore from snapshots (user decision 2026-10-09): list pre-overwrite and library snapshots (time,
 * project, size), preview, restore after a double confirm, verified after the write. The current
 * state is snapshotted first; local bytes are never lost (refused otherwise).
 */
import { useCallback, useEffect, useState } from 'react';
import { t, tf, type Locale } from '../../i18n';
import { useOverwriteSnapshots } from '../../hooks/importExport/useOverwriteSnapshots';
import type {
  OverwriteSnapshotPreview,
  OverwriteSnapshotRestoreResult,
  OverwriteSnapshotSummary,
} from '../../services/overwriteSnapshotRestoreService';
import { ModalPanel } from '../ui/ModalPanel';
import { PanelButton } from '../ui/PanelButton';
import { PanelSection } from '../ui/PanelSection';

interface SnapshotRestoreDialogProps {
  locale: Locale;
  isOpen: boolean;
  onClose: () => void;
  /** 恢复成功后重新加载页面（读到恢复后的数据与偏好）| Reload after a successful restore */
  onReload?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function snapshotLabel(locale: Locale, snapshot: OverwriteSnapshotSummary): string {
  if (snapshot.scope === 'library') {
    return tf(locale, 'transcription.projectHub.snapshotRestore.libraryLabel', {
      count: snapshot.projectCount,
    });
  }
  const title = snapshot.projectTitle
    ? (snapshot.projectTitle[locale] ?? Object.values(snapshot.projectTitle)[0])
    : undefined;
  return title ?? snapshot.projectId ?? '';
}

function kindLabel(locale: Locale, kind: OverwriteSnapshotSummary['packageKind']): string {
  return kind === 'snapshot-restore'
    ? t(locale, 'transcription.projectHub.snapshotRestore.kindBeforeRestore')
    : tf(locale, 'transcription.projectHub.snapshotRestore.kindBeforeImport', {
        kind: kind.toUpperCase(),
      });
}

function blockedText(locale: Locale, preview: OverwriteSnapshotPreview): string {
  if (preview.reason === 'collaborated') {
    return t(locale, 'transcription.projectHub.snapshotRestore.blockedCollaborated');
  }
  if (preview.reason === 'unsupported-version') {
    return t(locale, 'transcription.projectHub.snapshotRestore.blockedVersion');
  }
  return tf(locale, 'transcription.projectHub.snapshotRestore.blockedBytes', {
    count: preview.bytesAtRisk.length,
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SnapshotRestoreDialog({
  locale,
  isOpen,
  onClose,
  onReload,
}: SnapshotRestoreDialogProps) {
  const { snapshots, refresh, preview, restore } = useOverwriteSnapshots();
  const [selected, setSelected] = useState<OverwriteSnapshotPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OverwriteSnapshotRestoreResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(null);
    setConfirming(false);
    setError(null);
    setResult(null);
    refresh().catch((err: unknown) => setError(errorText(err)));
  }, [isOpen, refresh]);

  const handlePreview = useCallback(
    async (seq: number) => {
      setBusy(true);
      setError(null);
      setConfirming(false);
      setResult(null);
      try {
        setSelected(await preview(seq));
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(false);
      }
    },
    [preview],
  );

  const handleRestore = useCallback(async () => {
    if (!selected?.available) return;
    // 二次确认：第一次只显示警告 | Double confirm: the first click only shows the warning
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await restore(selected.summary.seq));
      setConfirming(false);
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [confirming, refresh, restore, selected]);

  const title = t(locale, 'transcription.projectHub.snapshotRestore.title');
  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      topmost
      className="left-rail-project-import-dialog dialog-card-wide panel-design-match panel-design-match-dialog"
      ariaLabel={title}
      title={title}
      closeDisabled={busy}
      footer={
        <>
          <PanelButton variant="ghost" disabled={busy} onClick={onClose}>
            {t(locale, 'transcription.dialog.cancel')}
          </PanelButton>
          {result ? (
            <PanelButton
              variant="primary"
              data-testid="snapshot-restore-reload"
              onClick={() => (onReload ? onReload() : window.location.reload())}
            >
              {t(locale, 'transcription.projectHub.snapshotRestore.reload')}
            </PanelButton>
          ) : selected ? (
            <PanelButton
              variant={confirming ? 'danger' : 'primary'}
              data-testid="snapshot-restore-restore"
              disabled={busy || !selected.available}
              onClick={() => void handleRestore()}
            >
              {confirming
                ? t(locale, 'transcription.projectHub.snapshotRestore.confirmRestore')
                : t(locale, 'transcription.projectHub.snapshotRestore.restore')}
            </PanelButton>
          ) : null}
        </>
      }
    >
      <PanelSection title={t(locale, 'transcription.projectHub.snapshotRestore.listTitle')}>
        <p>{t(locale, 'transcription.projectHub.snapshotRestore.intro')}</p>
        {snapshots !== null && snapshots.length === 0 ? (
          <p data-testid="snapshot-restore-empty">
            {t(locale, 'transcription.projectHub.snapshotRestore.empty')}
          </p>
        ) : null}
        {snapshots !== null && snapshots.length > 0 ? (
          <table data-testid="snapshot-restore-list">
            <thead>
              <tr>
                <th>{t(locale, 'transcription.projectHub.snapshotRestore.colTime')}</th>
                <th>{t(locale, 'transcription.projectHub.snapshotRestore.colProject')}</th>
                <th>{t(locale, 'transcription.projectHub.snapshotRestore.colTrigger')}</th>
                <th>{t(locale, 'transcription.projectHub.snapshotRestore.colSize')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.seq} data-testid={`snapshot-restore-row-${snapshot.seq}`}>
                  <td>{new Date(snapshot.createdAt).toLocaleString(locale)}</td>
                  <td>{snapshotLabel(locale, snapshot)}</td>
                  <td>{kindLabel(locale, snapshot.packageKind)}</td>
                  <td>
                    {formatSize(snapshot.sizeBytes)}
                    {' · '}
                    {tf(locale, 'transcription.projectHub.snapshotRestore.rows', {
                      count: snapshot.rowCount,
                    })}
                  </td>
                  <td>
                    <PanelButton
                      size="sm"
                      disabled={busy}
                      data-testid={`snapshot-restore-preview-${snapshot.seq}`}
                      aria-pressed={selected?.summary.seq === snapshot.seq}
                      onClick={() => void handlePreview(snapshot.seq)}
                    >
                      {t(locale, 'transcription.projectHub.snapshotRestore.preview')}
                    </PanelButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </PanelSection>
      {selected && !result ? (
        <PanelSection
          title={tf(locale, 'transcription.projectHub.snapshotRestore.previewTitle', {
            name: snapshotLabel(locale, selected.summary),
          })}
        >
          <table data-testid="snapshot-restore-preview">
            <thead>
              <tr>
                <th>{t(locale, 'transcription.projectHub.snapshotRestore.colTable')}</th>
                <th>{t(locale, 'transcription.projectHub.snapshotRestore.colInSnapshot')}</th>
                <th>{t(locale, 'transcription.projectHub.snapshotRestore.colNow')}</th>
              </tr>
            </thead>
            <tbody>
              {selected.collections
                .filter((c) => c.snapshotRows > 0 || c.currentRows > 0)
                .map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{c.snapshotRows}</td>
                    <td>{c.currentRows}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {selected.preferenceKeys.length > 0 ? (
            <p data-testid="snapshot-restore-preferences">
              {tf(locale, 'transcription.projectHub.snapshotRestore.preferences', {
                keys: selected.preferenceKeys.join(', '),
              })}
            </p>
          ) : null}
          {selected.available ? (
            <p>
              {selected.summary.scope === 'library'
                ? t(locale, 'transcription.projectHub.snapshotRestore.effectLibrary')
                : t(locale, 'transcription.projectHub.snapshotRestore.effectProject')}
            </p>
          ) : (
            <p role="alert" data-testid="snapshot-restore-blocked">
              {blockedText(locale, selected)}
            </p>
          )}
          {confirming ? (
            <p role="alert" data-testid="snapshot-restore-warning">
              {t(locale, 'transcription.projectHub.snapshotRestore.warning')}
            </p>
          ) : null}
        </PanelSection>
      ) : null}
      {result ? (
        <p role="status" data-testid="snapshot-restore-done">
          {tf(locale, 'transcription.projectHub.snapshotRestore.done', {
            rows: result.verifiedRows,
            seq: result.preRestoreSnapshotSeq,
          })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="snapshot-restore-error">
          {tf(locale, 'transcription.projectHub.snapshotRestore.failed', { message: error })}
        </p>
      ) : null}
    </ModalPanel>
  );
}
