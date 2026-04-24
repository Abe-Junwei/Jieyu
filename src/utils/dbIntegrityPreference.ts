/**
 * Phase F-2：启动后 IndexedDB 轻量自检开关与会话级跳过。
 * Boot-time DB integrity probe toggle and per-session skip flag.
 */

export const DB_INTEGRITY_PROBE_ENABLED_KEY = 'jieyu.settings.dbIntegrityProbeEnabled';
const DB_INTEGRITY_SESSION_SKIP_KEY = 'jieyu.dbIntegrity.sessionSkip';

export function readDbIntegrityProbeEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(DB_INTEGRITY_PROBE_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeDbIntegrityProbeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DB_INTEGRITY_PROBE_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

export function readDbIntegritySessionSkip(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DB_INTEGRITY_SESSION_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDbIntegritySessionSkip(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DB_INTEGRITY_SESSION_SKIP_KEY, '1');
  } catch {
    // ignore
  }
}
