import { normalizeLocale, type Locale } from './index';

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
};

const ZH: AppDataResilienceMessages = {
  backupReminderToast: '建议定期在「转写」工作台通过导出菜单保存 .jym / .jyt 全量备份，以防浏览器存储损坏或换机。',
  collabLocalStorageQuotaToast: '浏览器存储配额已满：协作同步状态已临时改用内存并镜像到 IndexedDB。请尽快导出备份或清理站点数据。',
  dbIntegrityTitle: '本地数据库自检未通过',
  dbIntegrityIntro: '关键表读取失败，数据可能已损坏。建议先导出全量备份（.jym），再尝试刷新页面。',
  dbIntegrityReason: '错误信息',
  dbIntegrityReload: '刷新页面',
  dbIntegrityRetry: '重新检测',
  dbIntegrityContinue: '仍继续使用（本次会话）',
  dbOpenTitle: '本地数据库无法打开',
  dbOpenIntro: '浏览器未能打开本应用的 IndexedDB。在未成功打开前，转写等依赖本地数据的功能可能无法使用。',
  dbOpenRecovery:
    '可尝试：在浏览器设置中为本站点清理存储/站点数据后重试；检查磁盘空间是否不足；在无痕窗口排除扩展干扰；或换用支持的桌面浏览器。若已导出过 .jym / .jyt，清理前请先备份到安全位置。',
  settingsBackupReminderLabel: '定期提醒导出全量备份',
  settingsBackupReminderHint: '开启后，若长期未导出 .jym/.jyt，将以 Toast 提示（每条约 24 小时最多一次）。',
  settingsDbIntegrityProbeLabel: '启动后自检本地数据库',
  settingsDbIntegrityProbeHint: '开启后，在首次打开数据库时轻量读取关键表；失败时显示可恢复提示。',
};

const EN: AppDataResilienceMessages = {
  backupReminderToast: 'Export a full .jym / .jyt archive periodically from the Transcription workspace export menu to guard against browser storage loss or device changes.',
  collabLocalStorageQuotaToast: 'Browser storage quota exceeded: collaboration sync state is using a memory overlay mirrored to IndexedDB. Export a backup or free site data soon.',
  dbIntegrityTitle: 'Local database self-check failed',
  dbIntegrityIntro: 'A critical table could not be read; your data may be damaged. Export a full backup (.jym), then try reloading the page.',
  dbIntegrityReason: 'Details',
  dbIntegrityReload: 'Reload page',
  dbIntegrityRetry: 'Run check again',
  dbIntegrityContinue: 'Continue anyway (this session)',
  dbOpenTitle: 'Local database could not be opened',
  dbOpenIntro:
    'The browser could not open this app’s IndexedDB. Transcription and other local-data features may not work until the database opens.',
  dbOpenRecovery:
    'Try: clear site data for this origin in browser settings, then reload; check free disk space; use a private window to rule out extensions; or use a supported desktop browser. If you rely on an exported .jym / .jyt, keep that backup in a safe place before clearing data.',
  settingsBackupReminderLabel: 'Periodic full backup reminder',
  settingsBackupReminderHint: 'When enabled, shows a toast if you have not exported a .jym/.jyt archive for a long time (at most about once per 24h while overdue).',
  settingsDbIntegrityProbeLabel: 'Run local database sanity check after startup',
  settingsDbIntegrityProbeHint: 'When enabled, performs a lightweight read of critical tables after the DB opens; shows a recoverable prompt on failure.',
};

export function getAppDataResilienceMessages(locale: Locale): AppDataResilienceMessages {
  return normalizeLocale(locale) === 'en-US' ? EN : ZH;
}
