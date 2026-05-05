/**
 * 备份提醒用的「上次导出」时间戳（localStorage）。
 * 独立成模块，避免 db/io 等底层代码依赖带 Toast 的 hook 文件（打破循环依赖）。
 */
export const BACKUP_LAST_EXPORT_KEY = 'jieyu.lastExportTimestamp';

/** 首次读取若无值，则以当前时间写入并返回，避免立即触发提醒。 */
export function readLastExportTimestamp(): number {
  try {
    const raw = window.localStorage.getItem(BACKUP_LAST_EXPORT_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Ignore read failures
  }
  const now = Date.now();
  try {
    window.localStorage.setItem(BACKUP_LAST_EXPORT_KEY, String(now));
  } catch {
    // Ignore write failures
  }
  return now;
}

/** 记录一次导出完成，重置提醒倒计时。 */
export function markBackupCompleted(): void {
  try {
    window.localStorage.setItem(BACKUP_LAST_EXPORT_KEY, String(Date.now()));
  } catch {
    // Ignore persistence failures
  }
}
