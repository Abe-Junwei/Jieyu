/**
 * 站点外备份（方案 6.2）：支持 File System Access 的浏览器把整库 JYB（含音频）写入用户选的备份文件夹，
 * 只保留最近 3 份；不支持的浏览器沿用已有的下载提醒（`backupExportReminderState`）。
 * Off-site backup (plan 6.2): with File System Access, write a whole-library JYB (audio included)
 * into a user-picked folder and keep the newest 3; otherwise the existing download reminder applies.
 */
import { recordFullProjectArchiveExportCompleted } from '../utils/backupExportReminderState';

export const BACKUP_FOLDER_KEEP = 3;
const BACKUP_FILE_PATTERN = /^jieyu-backup-\d{8}-\d{6}-\d{3}\.jyb$/;

type DirectoryHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FileSystemHandle>;
};
type DirectoryPicker = (options: { id: string; mode: 'readwrite' }) => Promise<DirectoryHandle>;

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

/**
 * 每次都让用户选文件夹（浏览器按 `id` 记住上次的位置），不保存句柄。只删本功能写的 `jieyu-backup-*.jyb`，
 * 而且只在新的一份完整写好之后；写入失败时删掉没写完的这一份，旧备份不动。
 * The user picks the folder each time (the browser remembers it by `id`); no handle is stored.
 * Only this feature's `jieyu-backup-*.jyb` files are removed, and only after the new one is complete;
 * a failed write removes its own partial file and leaves older backups alone.
 */
export async function backupLibraryToFolder(
  exportJyb: () => Promise<Uint8Array> = async () =>
    (await import('./JybService')).exportDatabaseToJyb({ includeMedia: true }),
): Promise<{ folderName: string; fileName: string; sizeBytes: number; removed: string[] } | null> {
  const pick = picker();
  if (typeof pick !== 'function') throw new Error('File System Access is not supported');
  let folder: DirectoryHandle;
  try {
    folder = await pick({ id: 'jieyu-backup', mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null; // 用户取消 | cancelled
    throw error;
  }
  const bytes = await exportJyb();
  const fileName = backupFileName();
  const writable = await (await folder.getFileHandle(fileName, { create: true })).createWritable();
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
  recordFullProjectArchiveExportCompleted();
  return { folderName: folder.name, fileName, sizeBytes: bytes.byteLength, removed };
}
