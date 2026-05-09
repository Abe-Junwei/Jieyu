import { useState, useCallback } from 'react';
import { OptionGroup, SettingRow, SettingsSection } from '../settingsModalPrimitives';
import {
  CACHE_ENTRIES,
  MAP_PROVIDER_OPTIONS,
  VOICE_DOCK_POSITION_STORAGE_KEY,
} from './settingsConstants';
import {
  getMapStyleOptions,
  getDefaultMapStyleId,
  readStoredMapProviderPreference,
  persistMapProviderPreference,
  estimateLocalStorageUsage,
} from './settingsHelpers';
import {
  readBackupReminderEnabled,
  snoozeBackupReminder,
  writeBackupReminderEnabled,
} from '../../utils/backupExportReminderState';
import {
  readDbIntegrityProbeEnabled,
  writeDbIntegrityProbeEnabled,
} from '../../utils/dbIntegrityPreference';
import type { AppDataResilienceMessages, SettingsModalMessages } from '../../i18n/messages';
import type { Locale } from '../../i18n';
import type { MapProviderKind, MapProviderPreference } from './settingsConstants';

interface SettingsDataTabProps {
  locale: Locale;
  msg: SettingsModalMessages;
  resilienceMsg: AppDataResilienceMessages;
}

export function SettingsDataTab({ locale: _locale, msg, resilienceMsg }: SettingsDataTabProps) {
  const [backupReminderEnabled, setBackupReminderEnabled] = useState(() =>
    readBackupReminderEnabled(),
  );
  const [dbIntegrityProbeEnabled, setDbIntegrityProbeEnabled] = useState(() =>
    readDbIntegrityProbeEnabled(),
  );
  const [clearedCaches, setClearedCaches] = useState<Set<string>>(new Set());
  const [mapProviderDefault, setMapProviderDefault] = useState<MapProviderPreference>(
    readStoredMapProviderPreference,
  );
  const [voiceDockPositionResetAt, setVoiceDockPositionResetAt] = useState<number | null>(null);

  const handleClearCache = (entry: (typeof CACHE_ENTRIES)[number]) => {
    try {
      localStorage.removeItem(entry.key);
    } catch {
      /* ignore */
    }
    setClearedCaches((prev) => new Set(prev).add(entry.id));
  };

  const handleResetAllData = useCallback(() => {
    if (!window.confirm(msg.dataResetConfirm)) return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('jieyu')) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }, [msg.dataResetConfirm]);

  const handleMapProviderKindChange = (kind: MapProviderKind) => {
    const next = {
      kind,
      styleId: getDefaultMapStyleId(kind),
    } as MapProviderPreference;
    setMapProviderDefault(next);
    persistMapProviderPreference(next);
  };

  const handleMapProviderStyleChange = useCallback(
    (styleId: string) => {
      const next = {
        ...mapProviderDefault,
        styleId,
      };
      setMapProviderDefault(next);
      persistMapProviderPreference(next);
    },
    [mapProviderDefault],
  );

  const handleResetVoiceDockPosition = () => {
    try {
      localStorage.removeItem(VOICE_DOCK_POSITION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setVoiceDockPositionResetAt(Date.now());
  };

  return (
    <div className="settings-sections-stack">
      <SettingsSection title={msg.dataWorkspaceIntegrationTitle}>
        <SettingRow label={msg.dataMapProviderLabel}>
          <OptionGroup
            value={mapProviderDefault.kind}
            options={MAP_PROVIDER_OPTIONS}
            onChange={handleMapProviderKindChange}
          />
        </SettingRow>
        <SettingRow label={msg.dataMapStyleLabel}>
          <select
            className="settings-select"
            value={mapProviderDefault.styleId}
            onChange={(e) => handleMapProviderStyleChange(e.currentTarget.value)}
          >
            {getMapStyleOptions(mapProviderDefault.kind).map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <div className="settings-data-row">
          <span className="settings-data-label">{msg.dataVoiceDockPositionLabel}</span>
          <button
            type="button"
            className="settings-link-btn"
            onClick={handleResetVoiceDockPosition}
          >
            {msg.dataVoiceDockResetBtn}
          </button>
        </div>
        {voiceDockPositionResetAt ? (
          <div className="settings-data-cleared">{msg.dataCleared}</div>
        ) : null}
      </SettingsSection>

      <SettingsSection title={msg.dataResilienceSectionTitle}>
        <SettingRow label={resilienceMsg.settingsBackupReminderLabel}>
          <input
            type="checkbox"
            checked={backupReminderEnabled}
            onChange={(e) => {
              const v = e.target.checked;
              writeBackupReminderEnabled(v);
              setBackupReminderEnabled(v);
            }}
            aria-label={resilienceMsg.settingsBackupReminderLabel}
          />
        </SettingRow>
        <p className="small-text settings-icon-effect-hint">
          {resilienceMsg.settingsBackupReminderHint}
        </p>
        <SettingRow label={resilienceMsg.settingsDbIntegrityProbeLabel}>
          <input
            type="checkbox"
            checked={dbIntegrityProbeEnabled}
            onChange={(e) => {
              const v = e.target.checked;
              writeDbIntegrityProbeEnabled(v);
              setDbIntegrityProbeEnabled(v);
            }}
            aria-label={resilienceMsg.settingsDbIntegrityProbeLabel}
          />
        </SettingRow>
        <p className="small-text settings-icon-effect-hint">
          {resilienceMsg.settingsDbIntegrityProbeHint}
        </p>
        <div className="settings-data-row">
          <button
            type="button"
            className="settings-link-btn"
            onClick={() => {
              snoozeBackupReminder();
            }}
          >
            {msg.dataResilienceSnoozeBackup}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title={msg.tabData}>
        {CACHE_ENTRIES.map((entry) => (
          <div key={entry.id} className="settings-data-row">
            <span className="settings-data-label">{msg[entry.msgKey]}</span>
            {clearedCaches.has(entry.id) ? (
              <span className="settings-data-cleared">{msg.dataCleared}</span>
            ) : (
              <button
                type="button"
                className="settings-link-btn"
                onClick={() => handleClearCache(entry)}
              >
                {msg.dataClearBtn}
              </button>
            )}
          </div>
        ))}
        <div className="settings-data-row settings-data-row-storage">
          <span className="settings-data-label">{msg.dataStorageEstimate}</span>
          <span className="settings-data-value">{estimateLocalStorageUsage()}</span>
        </div>
        <div className="settings-data-reset-section">
          <button type="button" className="settings-danger-btn" onClick={handleResetAllData}>
            {msg.dataResetAll}
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
