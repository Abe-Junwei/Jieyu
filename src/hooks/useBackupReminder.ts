import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import { tf, useLocale } from '../i18n';

const BACKUP_LAST_EXPORT_KEY = 'jieyu.lastExportTimestamp';
/** 连续工作超过此时间后触发提醒 | Remind after this many ms of active work */
const BACKUP_REMINDER_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
/** 检查间隔 | Check interval */
const BACKUP_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
/** 首次检查延迟（给启动让路）| Delay first check to avoid boot rush */
const BACKUP_FIRST_CHECK_DELAY_MS = 5 * 60 * 1000; // 5 minutes

function readLastExportTimestamp(): number {
  try {
    const raw = window.localStorage.getItem(BACKUP_LAST_EXPORT_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Ignore read failures
  }
  // 首次使用：以当前时间作为起点，避免立即弹出提醒 | First run: use now as baseline to avoid immediate popup
  const now = Date.now();
  try {
    window.localStorage.setItem(BACKUP_LAST_EXPORT_KEY, String(now));
  } catch {
    // Ignore write failures
  }
  return now;
}

/**
 * 记录一次导出完成，重置提醒倒计时。
 * Record an export completion to reset the reminder countdown.
 */
export function markBackupCompleted(): void {
  try {
    window.localStorage.setItem(BACKUP_LAST_EXPORT_KEY, String(Date.now()));
  } catch {
    // Ignore persistence failures
  }
}

/**
 * 定期检查距上次备份的活跃工作时间，超过阈值时通过 toast 提醒用户导出。
 * Periodically checks time since last backup and shows a toast reminder when threshold exceeded.
 * 仅在浏览器环境生效，SSR/测试环境无操作。
 */
export function useBackupReminder(enabled = true): void {
  const toast = useToast();
  const locale = useLocale();
  const lastRemindedRef = useRef(0);

  const checkAndRemind = useCallback(() => {
    if (!enabled || !toast) return;

    const lastExport = readLastExportTimestamp();
    const elapsed = Date.now() - lastExport;

    if (elapsed < BACKUP_REMINDER_THRESHOLD_MS) return;

    // 同一会话内不重复提醒 | Don't spam within the same session
    const sessionKey = Math.floor(elapsed / BACKUP_REMINDER_THRESHOLD_MS);
    if (lastRemindedRef.current >= sessionKey) return;
    lastRemindedRef.current = sessionKey;

    const hours = Math.round(elapsed / (60 * 60 * 1000));
    toast.showToast(
      tf(locale, 'msg.appData.backupElapsedReminderToast', { hours }),
      'warning',
      12_000,
    );
  }, [enabled, locale, toast]);

  useEffect(() => {
    if (!enabled) return;

    let intervalId: number | null = null;

    // 启动后延迟首次检查 | Delay first check after boot
    const firstTimer = window.setTimeout(() => {
      checkAndRemind();
      // 之后定期检查 | Then check periodically
      intervalId = window.setInterval(checkAndRemind, BACKUP_CHECK_INTERVAL_MS);
    }, BACKUP_FIRST_CHECK_DELAY_MS);

    // 用户执行导出后重置 | Reset when user exports (detect via storage event)
    const onStorage = (e: StorageEvent) => {
      if (e.key === BACKUP_LAST_EXPORT_KEY && e.newValue) {
        lastRemindedRef.current = 0;
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.clearTimeout(firstTimer);
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, [enabled, checkAndRemind]);
}
