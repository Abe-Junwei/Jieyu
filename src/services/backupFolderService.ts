/**
 * 站点外备份（方案 6.2）：支持 File System Access 的浏览器把整库 JYB（含音频）写入用户选的备份文件夹，
 * 只保留最近 3 份；可按间隔自动备份。不支持的浏览器沿用已有的下载提醒（`backupExportReminderState`）。
 * Off-site backup (plan 6.2): with File System Access, write a whole-library JYB (audio included)
 * into a user-chosen folder keeping the newest 3, optionally on a schedule. Otherwise the existing
 * download reminder applies.
 */
import { recordFullProjectArchiveExportCompleted } from '../utils/backupExportReminderState';

export const BACKUP_FOLDER_KEEP = 3;
/** 默认每天一次；0 = 关闭自动备份 | Daily by default; 0 = automatic backup off */
export const DEFAULT_BACKUP_INTERVAL_HOURS = 24;
const BACKUP_FILE_PATTERN = /^jieyu-backup-\d{8}-\d{6}-\d{3}\.jyb$/;
const STATUS_KEY = 'jieyu.backup.folder.status.v1';
const INTERVAL_KEY = 'jieyu.backup.folder.intervalHours';
const HANDLE_DB = 'jieyu_backup_folder';
const HANDLE_STORE = 'handles';
export const BACKUP_FOLDER_EVENT = 'jieyu:backup-folder-changed';

type Permission = { mode: 'readwrite' };
type DirectoryHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FileSystemHandle>;
  queryPermission?: (descriptor: Permission) => Promise<PermissionState>;
  requestPermission?: (descriptor: Permission) => Promise<PermissionState>;
};
type DirectoryPicker = (options: { id: string; mode: 'readwrite' }) => Promise<DirectoryHandle>;

export type BackupSuccess = { at: string; fileName: string; sizeBytes: number; removed: string[] };
export type BackupFailureReason = 'permission-needed' | 'no-folder' | 'failed';
export type BackupFolderStatus = {
  lastSuccess?: BackupSuccess;
  lastFailure?: { at: string; reason: BackupFailureReason; message: string };
};

export class BackupFolderError extends Error {
  constructor(
    readonly reason: BackupFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'BackupFolderError';
  }
}

function picker(): DirectoryPicker | undefined {
  return (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
}

export function isBackupFolderSupported(): boolean {
  return typeof picker() === 'function';
}

export function backupFileName(now: Date = new Date()): string {
  const p = (value: number, width = 2) => String(value).padStart(width, '0');
  return `jieyu-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${p(now.getMilliseconds(), 3)}.jyb`;
}

// —— 句柄（IndexedDB）| Handle (IndexedDB) ——

function handleStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(HANDLE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(HANDLE_STORE);
    open.onerror = () => reject(open.error ?? new Error('backup folder store unavailable'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(HANDLE_STORE, mode);
      const request = run(tx.objectStore(HANDLE_STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('backup folder store failed'));
      };
    };
  });
}

export async function readBackupFolder(): Promise<DirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  const value = await handleStore<unknown>('readonly', (store) => store.get('folder'));
  return value === undefined || value === null ? null : (value as DirectoryHandle);
}

/** 选择并记住备份文件夹（用户手势）；取消时返回 null | Choose and remember the folder (gesture) */
export async function chooseBackupFolder(): Promise<string | null> {
  const pick = picker();
  if (typeof pick !== 'function') throw new Error('File System Access is not supported');
  let folder: DirectoryHandle;
  try {
    folder = await pick({ id: 'jieyu-backup', mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null; // 用户取消 | cancelled
    throw error;
  }
  await handleStore('readwrite', (store) => store.put(folder, 'folder'));
  notify();
  return folder.name;
}

// —— 状态与设置（localStorage）| Status and setting (localStorage) ——

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BACKUP_FOLDER_EVENT));
}

export function readBackupFolderStatus(): BackupFolderStatus {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? '{}') as BackupFolderStatus;
  } catch {
    return {};
  }
}

function writeStatus(patch: BackupFolderStatus): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify({ ...readBackupFolderStatus(), ...patch }));
  } catch {
    // 状态写不进去不影响备份本身 | Failing to record must not fail the backup
  }
  notify();
}

export function readBackupIntervalHours(): number {
  const raw = Number(globalThis.localStorage?.getItem(INTERVAL_KEY));
  return Number.isFinite(raw) && raw >= 0 && globalThis.localStorage?.getItem(INTERVAL_KEY) !== null
    ? raw
    : DEFAULT_BACKUP_INTERVAL_HOURS;
}

export function writeBackupIntervalHours(hours: number): void {
  localStorage.setItem(INTERVAL_KEY, String(hours));
  notify();
}

// —— 备份 | Backup ——

/**
 * 写一份整库 JYB 到记住的文件夹，然后只保留最新 3 份。`interactive` 只能在用户手势里为 true：
 * 浏览器要求重新授权时才会弹出申请；否则以 `permission-needed` 失败并记录。只删本功能写的
 * `jieyu-backup-*.jyb`，而且只在新的一份写完之后；写入失败时删掉没写完的这一份，旧备份不动。
 * Write a whole-library JYB into the remembered folder and keep the newest 3. `interactive` may
 * only be true inside a user gesture: that is the only time the permission prompt is shown;
 * otherwise it fails as `permission-needed` and is recorded. Only this feature's files are removed,
 * only after the new one is complete; a failed write removes its own partial file.
 */
export async function backupLibraryToFolder(options: {
  interactive: boolean;
  exportJyb?: () => Promise<Uint8Array>;
}): Promise<BackupSuccess> {
  try {
    const folder = await readBackupFolder();
    if (!folder) throw new BackupFolderError('no-folder', 'no backup folder chosen');
    const descriptor: Permission = { mode: 'readwrite' };
    let permission = (await folder.queryPermission?.(descriptor)) ?? 'granted';
    if (permission !== 'granted' && options.interactive) {
      permission = (await folder.requestPermission?.(descriptor)) ?? 'denied';
    }
    if (permission !== 'granted') {
      throw new BackupFolderError('permission-needed', 'the browser needs permission again');
    }
    const exportJyb =
      options.exportJyb ??
      (async () => (await import('./JybService')).exportDatabaseToJyb({ includeMedia: true }));
    const bytes = await exportJyb();
    const fileName = backupFileName();
    const file = await folder.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(bytes as Uint8Array<ArrayBuffer>);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      await folder.removeEntry(fileName).catch(() => undefined);
      throw error;
    }
    const names: string[] = [];
    for await (const entry of folder.values()) {
      if (entry.kind === 'file' && BACKUP_FILE_PATTERN.test(entry.name)) names.push(entry.name);
    }
    const removed = names.sort().slice(0, Math.max(0, names.length - BACKUP_FOLDER_KEEP));
    for (const name of removed) await folder.removeEntry(name);
    const success = {
      at: new Date().toISOString(),
      fileName,
      sizeBytes: bytes.byteLength,
      removed,
    };
    writeStatus({ lastSuccess: success });
    recordFullProjectArchiveExportCompleted();
    return success;
  } catch (error) {
    const reason = error instanceof BackupFolderError ? error.reason : 'failed';
    const message = error instanceof Error ? error.message : String(error);
    writeStatus({ lastFailure: { at: new Date().toISOString(), reason, message } });
    throw error;
  }
}

/**
 * 自动备份：到期才跑（距上次成功 ≥ 间隔，且距上次失败也 ≥ 1 小时）；多个标签页用 Web Locks 只跑一个。
 * 返回 null 表示没到期 / 没选文件夹 / 关闭了。
 * Scheduled backup: runs only when due (interval since last success, and ≥1 h since last failure);
 * Web Locks keep it to one tab. Returns null when not due / no folder / disabled.
 */
export async function runScheduledBackupIfDue(
  now: number = Date.now(),
  exportJyb?: () => Promise<Uint8Array>,
): Promise<BackupSuccess | BackupFolderError | Error | null> {
  const hours = readBackupIntervalHours();
  if (hours <= 0 || !isBackupFolderSupported()) return null;
  const status = readBackupFolderStatus();
  const since = (iso?: string) => (iso ? now - Date.parse(iso) : Number.POSITIVE_INFINITY);
  if (since(status.lastSuccess?.at) < hours * 3_600_000) return null;
  if (since(status.lastFailure?.at) < 3_600_000) return null;
  if ((await readBackupFolder()) === null) return null;
  const run = () =>
    backupLibraryToFolder({ interactive: false, ...(exportJyb ? { exportJyb } : {}) }).catch(
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    );
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks) return run();
  return locks.request('jieyu-backup-folder', { ifAvailable: true }, (lock) =>
    lock ? run() : null,
  );
}
