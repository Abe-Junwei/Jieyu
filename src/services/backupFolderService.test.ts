import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/backupExportReminderState', () => ({
  recordFullProjectArchiveExportCompleted: vi.fn(),
}));

import {
  BACKUP_FOLDER_KEEP,
  BackupFolderError,
  backupFileName,
  backupLibraryToFolder,
  chooseBackupFolder,
  readBackupFolderStatus,
  runScheduledBackupIfDue,
  writeBackupIntervalHours,
} from './backupFolderService';

/** 按引用保存的最小 IndexedDB（目录句柄不能被结构化克隆进 fake-indexeddb）| By-reference IDB stub */
function referenceIndexedDb() {
  const data = new Map<string, unknown>();
  const request = <T>(result: T) => ({ result }) as { result: T };
  return {
    open() {
      const open: Record<string, unknown> = {};
      queueMicrotask(() => {
        open.result = {
          close() {},
          transaction() {
            const tx: Record<string, unknown> = {};
            const store = {
              get: (key: string) => request(data.get(key)),
              put: (value: unknown, key: string) => (data.set(key, value), request(key)),
            };
            tx.objectStore = () => store;
            queueMicrotask(() => (tx.oncomplete as () => void)());
            return tx;
          },
        };
        (open.onsuccess as () => void)();
      });
      return open;
    },
  };
}

function memoryFolder(
  initial: string[],
  opts: { failWrite?: boolean; permission?: PermissionState } = {},
) {
  const files = new Map<string, Uint8Array>(initial.map((name) => [name, new Uint8Array(1)]));
  let permission = opts.permission ?? 'granted';
  return {
    files,
    handle: {
      name: 'backups',
      queryPermission: async () => permission,
      requestPermission: vi.fn(async () => (permission = 'granted')),
      async getFileHandle(name: string) {
        files.set(name, new Uint8Array(0));
        return {
          async createWritable() {
            return {
              async write(bytes: Uint8Array) {
                if (opts.failWrite) throw new DOMException('quota', 'QuotaExceededError');
                files.set(name, bytes);
              },
              async close() {},
              async abort() {},
            };
          },
        };
      },
      async removeEntry(name: string) {
        files.delete(name);
      },
      async *values() {
        for (const name of files.keys()) yield { kind: 'file', name };
      },
    },
  };
}

const store = new Map<string, string>();
const bytes = async () => new Uint8Array([1, 2, 3]);
const OLD = [
  'jieyu-backup-20261001-090000-000.jyb',
  'jieyu-backup-20261002-090000-000.jyb',
  'jieyu-backup-20261003-090000-000.jyb',
];

async function useFolder(folder: ReturnType<typeof memoryFolder>) {
  vi.stubGlobal('showDirectoryPicker', async () => folder.handle);
  await chooseBackupFolder();
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  vi.stubGlobal('indexedDB', referenceIndexedDb());
});
afterEach(() => vi.unstubAllGlobals());

describe('backupFolderService', () => {
  it('writes a backup into the remembered folder and keeps the newest three of its own files', async () => {
    const folder = memoryFolder([...OLD, 'notes.txt', 'jieyu-library-2026-10-01.jyb']);
    await useFolder(folder);
    const result = await backupLibraryToFolder({ interactive: false, exportJyb: bytes });
    expect(result).toMatchObject({ sizeBytes: 3, removed: [OLD[0]] });
    const kept = [...folder.files.keys()].filter((n) => n.startsWith('jieyu-backup-'));
    expect(kept).toHaveLength(BACKUP_FOLDER_KEEP);
    expect(kept).toContain(result.fileName);
    expect(folder.files.has('notes.txt')).toBe(true);
    expect(folder.files.has('jieyu-library-2026-10-01.jyb')).toBe(true);
    expect(readBackupFolderStatus().lastSuccess?.fileName).toBe(result.fileName);
  });

  it('a failed write removes only its partial file, keeps older backups and records the failure', async () => {
    const folder = memoryFolder(OLD, { failWrite: true });
    await useFolder(folder);
    await expect(backupLibraryToFolder({ interactive: false, exportJyb: bytes })).rejects.toThrow(
      'quota',
    );
    expect([...folder.files.keys()].sort()).toEqual(OLD);
    expect(readBackupFolderStatus().lastFailure).toMatchObject({ reason: 'failed' });
  });

  it('asks for permission only when interactive; otherwise records permission-needed', async () => {
    const folder = memoryFolder([], { permission: 'prompt' });
    await useFolder(folder);
    await expect(
      backupLibraryToFolder({ interactive: false, exportJyb: bytes }),
    ).rejects.toBeInstanceOf(BackupFolderError);
    expect(folder.handle.requestPermission).not.toHaveBeenCalled();
    expect(readBackupFolderStatus().lastFailure).toMatchObject({ reason: 'permission-needed' });

    await backupLibraryToFolder({ interactive: true, exportJyb: bytes });
    expect(folder.handle.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('schedule: runs when due, not before the interval, backs off after a failure, off at 0', async () => {
    const folder = memoryFolder([]);
    await useFolder(folder);
    const now = Date.now();
    // 首次：没有成功记录即到期 | First run is due
    const first = await runScheduledBackupIfDue(now, bytes);
    expect(first).toMatchObject({ removed: [] });
    // 默认每天：一小时后不到期 | Daily default: not due an hour later
    await expect(runScheduledBackupIfDue(now + 3_600_000)).resolves.toBeNull();
    // 25 小时后到期 | Due after 25 hours
    expect(await runScheduledBackupIfDue(now + 25 * 3_600_000, bytes)).not.toBeNull();

    writeBackupIntervalHours(0);
    await expect(runScheduledBackupIfDue(now + 100 * 3_600_000)).resolves.toBeNull();

    writeBackupIntervalHours(24);
    store.set(
      'jieyu.backup.folder.status.v1',
      JSON.stringify({
        lastFailure: { at: new Date(now).toISOString(), reason: 'failed', message: 'x' },
      }),
    );
    // 刚失败过一小时内不重试 | No retry within an hour of a failure
    await expect(runScheduledBackupIfDue(now + 60_000)).resolves.toBeNull();
  });

  it('a scheduled run without permission reports permission-needed instead of prompting', async () => {
    const folder = memoryFolder([], { permission: 'prompt' });
    await useFolder(folder);
    const outcome = await runScheduledBackupIfDue(Date.now(), bytes);
    expect(outcome).toBeInstanceOf(BackupFolderError);
    expect((outcome as BackupFolderError).reason).toBe('permission-needed');
    expect(folder.handle.requestPermission).not.toHaveBeenCalled();
  });

  it('names sort by time', () => {
    expect(backupFileName(new Date(2026, 9, 9, 7, 5, 3, 42))).toBe(
      'jieyu-backup-20261009-070503-042.jyb',
    );
  });
});
