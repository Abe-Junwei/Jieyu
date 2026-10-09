import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/messages';
import { useFocusTrap } from '../hooks/ui/useFocusTrap';
import { dispatchAppGlobalToast } from '../utils/appGlobalToast';
import {
  getMigrationGateStatus,
  subscribeMigrationGateStatus,
  type MigrationGateStatus,
} from '../db/migration/migrationGateStatus';
import type { MigrationGateErrorDetail } from '../db/migration/migrationGate';
import { JIEYU_DEXIE_TARGET_SCHEMA_VERSION } from '../db/migration/schemaVersions';

export type DbMigrationGateOverlayProps = {
  locale: Locale;
  /** 测试可注入 | injectable for tests */
  exportRawSnapshot?: (detail: MigrationGateErrorDetail) => Promise<void>;
  reload?: () => void;
};

async function defaultExportRawSnapshot(detail: MigrationGateErrorDetail): Promise<void> {
  // 不经过 getDb()：原生、只读、不指定版本 | bypass getDb(): native, read-only, version-less
  const { exportRawIdbSnapshot, downloadRawRecoveryExport } =
    await import('../db/migration/rawRecoveryExport');
  const result = await exportRawIdbSnapshot({
    dbName: detail.dbName,
    appSchemaVersion: JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
    reason: detail.reason,
  });
  downloadRawRecoveryExport(result);
}

function reloadPage(): void {
  window.location.reload();
}

type ExportState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string };

/**
 * rev5 8.2：迁移闸门的阻断提示（数据比应用新、rewriting 被阻止、其他标签页占用、应用已更新），
 * 以及 additive 无快照时的可见警告。被阻止时提供原始恢复导出。
 * rev5 8.2: blocking notices of the migration gate plus the D2 visible warning; offers the raw
 * recovery export while blocked.
 */
export function DbMigrationGateOverlay(props: DbMigrationGateOverlayProps): ReactElement | null {
  const { exportRawSnapshot = defaultExportRawSnapshot, reload = reloadPage } = props;
  const msg = getAppDataResilienceMessages(props.locale);
  const status: MigrationGateStatus = useSyncExternalStore(
    subscribeMigrationGateStatus,
    getMigrationGateStatus,
    getMigrationGateStatus,
  );
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });
  const panelRef = useRef<HTMLDivElement>(null);
  const blocking = status.kind === 'gate-failed' || status.kind === 'stale';
  useFocusTrap(panelRef, blocking);

  const warning = status.kind === 'warning' ? status.warning : null;
  useEffect(() => {
    if (warning === null) return;
    dispatchAppGlobalToast({
      message: msg.migrationGateWarningToast,
      variant: 'warning',
      autoDismissMs: 20_000,
    });
  }, [warning, msg.migrationGateWarningToast]);

  const onExport = useCallback(async () => {
    if (status.kind !== 'gate-failed') return;
    setExportState({ kind: 'busy' });
    try {
      await exportRawSnapshot(status.detail);
      setExportState({ kind: 'done' });
    } catch (error) {
      setExportState({
        kind: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [exportRawSnapshot, status]);

  if (!blocking) return null;

  let title: string;
  let intro: string;
  let detailText: string | null = null;
  let offerRawExport = false;
  if (status.kind === 'stale') {
    title = msg.migrationGateStaleTitle;
    intro = msg.migrationGateStaleIntro;
  } else {
    const { detail } = status;
    detailText = detail.message;
    offerRawExport = detail.offerRawExport;
    if (detail.reason === 'data-newer-than-app') {
      title = msg.migrationGateNewerTitle;
      intro = msg.migrationGateNewerIntro;
    } else if (detail.reason === 'migration-blocked') {
      title = msg.migrationGateBlockedTitle;
      intro = msg.migrationGateBlockedIntro;
    } else {
      title = msg.migrationGateTabsTitle;
      intro = msg.migrationGateTabsIntro;
    }
  }

  return (
    <div
      ref={panelRef}
      className="legacy-data-reset-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="db-migration-gate-title"
      aria-describedby="db-migration-gate-intro"
      data-testid="db-migration-gate-overlay"
      data-gate-kind={status.kind === 'stale' ? 'stale' : status.detail.reason}
      tabIndex={-1}
    >
      <div className="legacy-data-reset-dialog-panel">
        <h2 id="db-migration-gate-title" className="legacy-data-reset-dialog-title">
          {title}
        </h2>
        <p id="db-migration-gate-intro" className="legacy-data-reset-dialog-text">
          {intro}
        </p>
        {detailText !== null ? (
          <p className="legacy-data-reset-dialog-text">
            <strong>{msg.migrationGateDetails}</strong> <code>{detailText}</code>
          </p>
        ) : null}
        {exportState.kind === 'done' ? (
          <p
            className="legacy-data-reset-dialog-text"
            role="status"
            data-testid="db-migration-gate-export-done"
          >
            {msg.migrationGateExportDone}
          </p>
        ) : null}
        {exportState.kind === 'failed' ? (
          <p className="legacy-data-reset-dialog-error" role="status">
            {msg.migrationGateExportFailed} <code>{exportState.message}</code>
          </p>
        ) : null}
        <div className="legacy-data-reset-dialog-actions">
          {offerRawExport ? (
            <button
              type="button"
              className="settings-danger-btn"
              disabled={exportState.kind === 'busy'}
              data-testid="db-migration-gate-export-raw"
              onClick={() => {
                void onExport();
              }}
            >
              {exportState.kind === 'busy'
                ? msg.migrationGateExporting
                : msg.migrationGateExportRaw}
            </button>
          ) : null}
          <button type="button" className="settings-link-btn" onClick={reload}>
            {msg.migrationGateReload}
          </button>
        </div>
      </div>
    </div>
  );
}
