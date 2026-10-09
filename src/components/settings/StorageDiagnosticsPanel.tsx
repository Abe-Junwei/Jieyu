import { useCallback, useEffect, useState } from 'react';
import { t, tf, type Locale } from '../../i18n';
import type { DictKey } from '../../i18n/dictKeys';
import {
  readStorageDiagnostics,
  requestPersistOnGesture,
  STORAGE_DURABILITY_EVENT,
  type PersistOutcome,
  type PersistTrigger,
  type StorageDiagnostics,
} from '../../utils/storageDurability';
import {
  BACKUP_FOLDER_EVENT,
  backupLibraryToFolder,
  chooseBackupFolder,
  isBackupFolderSupported,
  readBackupFolder,
  readBackupFolderStatus,
  readBackupIntervalHours,
  writeBackupIntervalHours,
} from '../../services/backupFolderService';
import { SettingRow, SettingsSection } from '../settingsModalPrimitives';

const MIB = 1024 * 1024;
const mib = (bytes: number) => (bytes / MIB).toFixed(1);

const OUTCOME_KEYS: Record<PersistOutcome, DictKey> = {
  granted: 'msg.appData.storageOutcomeGranted',
  denied: 'msg.appData.storageOutcomeDenied',
  unsupported: 'msg.appData.storageOutcomeUnsupported',
  error: 'msg.appData.storageOutcomeError',
};
const TRIGGER_KEYS: Record<PersistTrigger, DictKey> = {
  startup: 'msg.appData.storageTriggerStartup',
  import: 'msg.appData.storageTriggerImport',
  save: 'msg.appData.storageTriggerSave',
  manual: 'msg.appData.storageTriggerManual',
};

/** 诊断面板：estimate()、persist 结果、Safari 提示、备份文件夹（方案 6.2 / T44）| Diagnostics panel (plan 6.2 / T44) */
export function StorageDiagnosticsPanel({ locale }: { locale: Locale }) {
  const [diag, setDiag] = useState<StorageDiagnostics | null>(null);
  const refresh = useCallback(() => {
    void readStorageDiagnostics().then(setDiag);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(STORAGE_DURABILITY_EVENT, refresh);
    return () => window.removeEventListener(STORAGE_DURABILITY_EVENT, refresh);
  }, [refresh]);

  const last = diag?.lastPersistRequest ?? null;
  return (
    <SettingsSection title={t(locale, 'msg.appData.storageTitle')}>
      <div data-testid="storage-diagnostics">
        <SettingRow label={t(locale, 'msg.appData.storageUsage')}>
          <span data-testid="storage-usage">
            {diag?.usageBytes != null && diag.quotaBytes != null && diag.quotaBytes > 0
              ? tf(locale, 'msg.appData.storageUsageValue', {
                  usage: mib(diag.usageBytes),
                  quota: mib(diag.quotaBytes),
                  percent: ((diag.usageBytes / diag.quotaBytes) * 100).toFixed(1),
                })
              : t(locale, 'msg.appData.storageUnknown')}
          </span>
        </SettingRow>
        <SettingRow label={t(locale, 'msg.appData.storagePersisted')}>
          <span data-testid="storage-persisted">
            {diag?.persisted == null
              ? t(locale, 'msg.appData.storageUnknown')
              : t(
                  locale,
                  diag.persisted
                    ? 'msg.appData.storagePersistedYes'
                    : 'msg.appData.storagePersistedNo',
                )}
          </span>
        </SettingRow>
        <SettingRow label={t(locale, 'msg.appData.storageLastRequest')}>
          <span data-testid="storage-last-persist">
            {last
              ? tf(locale, 'msg.appData.storageLastRequestValue', {
                  outcome: t(locale, OUTCOME_KEYS[last.outcome]),
                  trigger: t(locale, TRIGGER_KEYS[last.trigger]),
                  at: new Date(last.at).toLocaleString(locale),
                })
              : t(locale, 'msg.appData.storageLastRequestNone')}
          </span>
        </SettingRow>
        <div className="settings-data-row">
          <button
            type="button"
            className="settings-link-btn"
            onClick={() => void requestPersistOnGesture('manual')}
          >
            {t(locale, 'msg.appData.storageRequestPersist')}
          </button>
        </div>
        <p className="small-text settings-icon-effect-hint">
          {t(locale, 'msg.appData.storageSafariNote')}
        </p>
        {isBackupFolderSupported() ? (
          <BackupFolderSection locale={locale} />
        ) : (
          <p className="small-text settings-icon-effect-hint">
            {t(locale, 'msg.appData.storageBackupUnsupported')}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}

const INTERVAL_OPTIONS: Array<[number, DictKey]> = [
  [0, 'msg.appData.storageBackupIntervalOff'],
  [6, 'msg.appData.storageBackupInterval6h'],
  [24, 'msg.appData.storageBackupIntervalDaily'],
  [168, 'msg.appData.storageBackupIntervalWeekly'],
];

/** 备份文件夹：选择、自动备份间隔、立即备份、上次成功 / 失败 | Backup folder controls and status */
function BackupFolderSection({ locale }: { locale: Locale }) {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [status, setStatus] = useState(readBackupFolderStatus);
  const [interval, setIntervalHours] = useState(readBackupIntervalHours);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    setStatus(readBackupFolderStatus());
    setIntervalHours(readBackupIntervalHours());
    void readBackupFolder().then((folder) => setFolderName(folder?.name ?? null));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(BACKUP_FOLDER_EVENT, refresh);
    return () => window.removeEventListener(BACKUP_FOLDER_EVENT, refresh);
  }, [refresh]);

  const backupNow = () => {
    setBusy(true);
    // 状态与失败原因都由服务记录并通过事件刷新 | Outcome is recorded by the service and refreshed via the event
    void backupLibraryToFolder({ interactive: true })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  const when = (iso: string) => new Date(iso).toLocaleString(locale);
  const success = status.lastSuccess;
  const failure = status.lastFailure;
  return (
    <>
      <SettingRow label={t(locale, 'msg.appData.storageBackupFolderLabel')}>
        <span data-testid="backup-folder-name">
          {folderName ?? t(locale, 'msg.appData.storageBackupFolderNone')}
        </span>{' '}
        <button
          type="button"
          className="settings-link-btn"
          onClick={() => void chooseBackupFolder().catch(() => undefined)}
        >
          {t(locale, 'msg.appData.storageBackupChoose')}
        </button>
      </SettingRow>
      <SettingRow label={t(locale, 'msg.appData.storageBackupInterval')}>
        <select
          aria-label={t(locale, 'msg.appData.storageBackupInterval')}
          data-testid="backup-folder-interval"
          value={interval}
          onChange={(event) => writeBackupIntervalHours(Number(event.target.value))}
        >
          {INTERVAL_OPTIONS.map(([hours, key]) => (
            <option key={hours} value={hours}>
              {t(locale, key)}
            </option>
          ))}
        </select>
      </SettingRow>
      <div className="settings-data-row">
        <button
          type="button"
          className="settings-link-btn"
          disabled={busy || folderName === null}
          onClick={backupNow}
        >
          {t(locale, 'msg.appData.storageBackupFolder')}
        </button>
      </div>
      {success ? (
        <p className="small-text" data-testid="backup-folder-last-success">
          {tf(locale, 'msg.appData.storageBackupDone', {
            at: when(success.at),
            file: success.fileName,
            size: mib(success.sizeBytes),
            count: success.removed.length,
          })}
        </p>
      ) : null}
      {failure ? (
        <p className="small-text" role="alert" data-testid="backup-folder-last-failure">
          {tf(locale, 'msg.appData.storageBackupFailed', {
            at: when(failure.at),
            message:
              failure.reason === 'permission-needed'
                ? t(locale, 'msg.appData.storageBackupPermissionNeeded')
                : failure.message,
          })}
        </p>
      ) : null}
    </>
  );
}
