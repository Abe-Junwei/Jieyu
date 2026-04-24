import { normalizeLocale, t, type Locale } from './index';

export type AppDataResilienceMessages = {
  backupReminderToast: string;
  collabLocalStorageQuotaToast: string;
  dbIntegrityTitle: string;
  dbIntegrityIntro: string;
  dbIntegrityReason: string;
  dbIntegrityReload: string;
  dbIntegrityRetry: string;
  dbIntegrityContinue: string;
  dbOpenTitle: string;
  dbOpenIntro: string;
  dbOpenRecovery: string;
  dbMigrationTitle: string;
  dbMigrationIntro: string;
  dbMigrationVersionHint: string;
  dbMigrationWait: string;
  settingsBackupReminderLabel: string;
  settingsBackupReminderHint: string;
  settingsDbIntegrityProbeLabel: string;
  settingsDbIntegrityProbeHint: string;
};

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getAppDataResilienceMessages(locale: Locale): AppDataResilienceMessages {
  const l = dictLocale(locale);
  return {
    backupReminderToast: t(l, 'msg.appData.backupReminderToast'),
    collabLocalStorageQuotaToast: t(l, 'msg.appData.collabLocalStorageQuotaToast'),
    dbIntegrityTitle: t(l, 'msg.appData.dbIntegrityTitle'),
    dbIntegrityIntro: t(l, 'msg.appData.dbIntegrityIntro'),
    dbIntegrityReason: t(l, 'msg.appData.dbIntegrityReason'),
    dbIntegrityReload: t(l, 'msg.appData.dbIntegrityReload'),
    dbIntegrityRetry: t(l, 'msg.appData.dbIntegrityRetry'),
    dbIntegrityContinue: t(l, 'msg.appData.dbIntegrityContinue'),
    dbOpenTitle: t(l, 'msg.appData.dbOpenTitle'),
    dbOpenIntro: t(l, 'msg.appData.dbOpenIntro'),
    dbOpenRecovery: t(l, 'msg.appData.dbOpenRecovery'),
    dbMigrationTitle: t(l, 'msg.appData.dbMigrationTitle'),
    dbMigrationIntro: t(l, 'msg.appData.dbMigrationIntro'),
    dbMigrationVersionHint: t(l, 'msg.appData.dbMigrationVersionHint'),
    dbMigrationWait: t(l, 'msg.appData.dbMigrationWait'),
    settingsBackupReminderLabel: t(l, 'msg.appData.settingsBackupReminderLabel'),
    settingsBackupReminderHint: t(l, 'msg.appData.settingsBackupReminderHint'),
    settingsDbIntegrityProbeLabel: t(l, 'msg.appData.settingsDbIntegrityProbeLabel'),
    settingsDbIntegrityProbeHint: t(l, 'msg.appData.settingsDbIntegrityProbeHint'),
  };
}
