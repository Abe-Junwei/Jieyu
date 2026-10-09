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
import { backupLibraryToFolder, isBackupFolderSupported } from '../../services/backupFolderService';
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
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void readStorageDiagnostics().then(setDiag);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(STORAGE_DURABILITY_EVENT, refresh);
    return () => window.removeEventListener(STORAGE_DURABILITY_EVENT, refresh);
  }, [refresh]);

  const backup = useCallback(async () => {
    setBackupMessage(null);
    try {
      const result = await backupLibraryToFolder();
      if (result) {
        setBackupMessage(
          tf(locale, 'msg.appData.storageBackupDone', {
            folder: result.folderName,
            file: result.fileName,
            size: mib(result.sizeBytes),
            count: result.removed.length,
          }),
        );
      }
    } catch (error) {
      setBackupMessage(
        tf(locale, 'msg.appData.storageBackupFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    refresh();
  }, [locale, refresh]);

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
          <div className="settings-data-row">
            <button type="button" className="settings-link-btn" onClick={() => void backup()}>
              {t(locale, 'msg.appData.storageBackupFolder')}
            </button>
          </div>
        ) : (
          <p className="small-text settings-icon-effect-hint">
            {t(locale, 'msg.appData.storageBackupUnsupported')}
          </p>
        )}
        {backupMessage ? (
          <p className="small-text" role="status" data-testid="storage-backup-result">
            {backupMessage}
          </p>
        ) : null}
      </div>
    </SettingsSection>
  );
}
