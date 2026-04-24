/**
 * Phase F-1：全量备份（JYM/JYT）导出提醒的本地偏好与计时。
 * Local preferences and timers for full-project archive export reminders.
 */

export const BACKUP_REMINDER_ENABLED_KEY = 'jieyu.settings.backupReminderEnabled';
export const BACKUP_LAST_FULL_EXPORT_AT_KEY = 'jieyu.backup.lastFullExportAt';
export const BACKUP_REMINDER_SNOOZE_UNTIL_KEY = 'jieyu.backup.reminderSnoozeUntil';
export const BACKUP_FIRST_APP_OPEN_AT_KEY = 'jieyu.backup.firstAppOpenAt';
export const BACKUP_LAST_REMINDER_TOAST_AT_KEY = 'jieyu.backup.lastReminderToastAt';
/** 自上次全量导出后，IndexedDB 转写相关表若有写入，置为 `1`；成功导出后清除 | Set after mutating canonical transcription tables until next successful archive export */
export const BACKUP_DIRTY_SINCE_EXPORT_KEY = 'jieyu.backup.dirtySinceLastExport';

/** 已触发提醒后，同一条目下的最短间隔 | Min spacing between reminder toasts */
export const BACKUP_REMINDER_TOAST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * 已有至少一次全量导出且库被标为 dirty 时，距上次导出满该时长即可进入 `shouldFireBackupReminder`（仍受 snooze / toast 冷却约束）。
 * When the DB is marked dirty after a prior export, allow reminder once this long after `BACKUP_LAST_FULL_EXPORT_AT_KEY` (still gated by snooze / toast cooldown).
 */
export const BACKUP_REMINDER_DIRTY_MIN_AFTER_EXPORT_MS = 24 * 60 * 60 * 1000;

/** 已有导出记录后的提醒间隔 | Interval once user has exported at least once */
export const BACKUP_REMINDER_INTERVAL_AFTER_EXPORT_MS = 7 * 24 * 60 * 60 * 1000;
/** 从未导出时，自首次记录打开起的宽限期 | Grace period before first nag when never exported */
export const BACKUP_REMINDER_FIRST_NAG_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
/** 「本周不再提醒」类延后 | Snooze duration from dismiss */
export const BACKUP_REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function readBackupReminderEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(BACKUP_REMINDER_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeBackupReminderEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKUP_REMINDER_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

/** 成功完成 JYM/JYT 下载后调用 | Call after successful JYM/JYT archive download */
export function recordFullProjectArchiveExportCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKUP_LAST_FULL_EXPORT_AT_KEY, String(Date.now()));
    window.localStorage.removeItem(BACKUP_REMINDER_SNOOZE_UNTIL_KEY);
    window.localStorage.removeItem(BACKUP_DIRTY_SINCE_EXPORT_KEY);
  } catch {
    // ignore
  }
}

/** Dexie 层在 `layer_units` / `layer_unit_contents` / `tier_annotations` 发生写时调用 | Called from Dexie hooks on canonical transcription stores */
export function markBackupDirtySinceLastExport(): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
    return;
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKUP_DIRTY_SINCE_EXPORT_KEY, '1');
  } catch {
    // ignore
  }
}

function readBackupDirtySinceLastExport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(BACKUP_DIRTY_SINCE_EXPORT_KEY) === '1';
  } catch {
    return false;
  }
}

export function snoozeBackupReminder(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKUP_REMINDER_SNOOZE_UNTIL_KEY, String(Date.now() + BACKUP_REMINDER_SNOOZE_MS));
  } catch {
    // ignore
  }
}

export function recordBackupReminderToastShown(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKUP_LAST_REMINDER_TOAST_AT_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function ensureFirstAppOpenRecorded(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!window.localStorage.getItem(BACKUP_FIRST_APP_OPEN_AT_KEY)) {
      window.localStorage.setItem(BACKUP_FIRST_APP_OPEN_AT_KEY, String(Date.now()));
    }
  } catch {
    // ignore
  }
}

export function shouldFireBackupReminder(now = Date.now()): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
    return false;
  }
  if (typeof window === 'undefined') return false;
  if (!readBackupReminderEnabled()) return false;
  ensureFirstAppOpenRecorded();
  try {
    const snoozeUntil = Number(window.localStorage.getItem(BACKUP_REMINDER_SNOOZE_UNTIL_KEY) ?? '0');
    if (Number.isFinite(snoozeUntil) && snoozeUntil > now) {
      return false;
    }
    const lastToast = Number(window.localStorage.getItem(BACKUP_LAST_REMINDER_TOAST_AT_KEY) ?? '0');
    if (Number.isFinite(lastToast) && lastToast > 0 && now - lastToast < BACKUP_REMINDER_TOAST_COOLDOWN_MS) {
      return false;
    }
    const lastExport = Number(window.localStorage.getItem(BACKUP_LAST_FULL_EXPORT_AT_KEY) ?? '0');
    const dirtySinceExport = readBackupDirtySinceLastExport();
    if (Number.isFinite(lastExport) && lastExport > 0) {
      const intervalElapsed = now - lastExport >= BACKUP_REMINDER_INTERVAL_AFTER_EXPORT_MS;
      const dirtyNag =
        dirtySinceExport && now - lastExport >= BACKUP_REMINDER_DIRTY_MIN_AFTER_EXPORT_MS;
      return intervalElapsed || dirtyNag;
    }
    const firstOpen = Number(window.localStorage.getItem(BACKUP_FIRST_APP_OPEN_AT_KEY) ?? '0');
    if (!Number.isFinite(firstOpen) || firstOpen <= 0) {
      return false;
    }
    return now - firstOpen >= BACKUP_REMINDER_FIRST_NAG_AFTER_MS;
  } catch {
    return false;
  }
}
