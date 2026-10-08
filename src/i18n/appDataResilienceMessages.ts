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
  settingsBackupReminderLabel: string;
  settingsBackupReminderHint: string;
  settingsDbIntegrityProbeLabel: string;
  settingsDbIntegrityProbeHint: string;
  legacyResetTitle: string;
  legacyResetIntro: string;
  legacyResetDatabasesLabel: string;
  legacyResetKeepNote: string;
  legacyResetConfirm: string;
  legacyResetDecline: string;
  legacyResetWorking: string;
  legacyResetFailed: string;
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
    settingsBackupReminderLabel: t(l, 'msg.appData.settingsBackupReminderLabel'),
    settingsBackupReminderHint: t(l, 'msg.appData.settingsBackupReminderHint'),
    settingsDbIntegrityProbeLabel: t(l, 'msg.appData.settingsDbIntegrityProbeLabel'),
    settingsDbIntegrityProbeHint: t(l, 'msg.appData.settingsDbIntegrityProbeHint'),
    legacyResetTitle: t(l, 'msg.appData.legacyResetTitle'),
    legacyResetIntro: t(l, 'msg.appData.legacyResetIntro'),
    legacyResetDatabasesLabel: t(l, 'msg.appData.legacyResetDatabasesLabel'),
    legacyResetKeepNote: t(l, 'msg.appData.legacyResetKeepNote'),
    legacyResetConfirm: t(l, 'msg.appData.legacyResetConfirm'),
    legacyResetDecline: t(l, 'msg.appData.legacyResetDecline'),
    legacyResetWorking: t(l, 'msg.appData.legacyResetWorking'),
    legacyResetFailed: t(l, 'msg.appData.legacyResetFailed'),
  };
}
