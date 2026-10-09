import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/backupExportReminderState', () => ({
  recordFullProjectArchiveExportCompleted: vi.fn(),
}));

import { BACKUP_FOLDER_KEEP, backupFileName, backupLibraryToFolder } from './backupFolderService';

/** 内存里的目录句柄 | In-memory directory handle */
function memoryFolder(initial: string[], failWrite = false) {
  const files = new Map<string, Uint8Array>(initial.map((name) => [name, new Uint8Array(1)]));
  return {
    files,
    handle: {
      name: 'backups',
      async getFileHandle(name: string) {
        files.set(name, new Uint8Array(0));
        return {
          async createWritable() {
            return {
              async write(bytes: Uint8Array) {
                if (failWrite) throw new DOMException('quota', 'QuotaExceededError');
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

afterEach(() => vi.unstubAllGlobals());

describe('backupFolderService', () => {
  it('writes a new backup and keeps only the newest three of its own files', async () => {
    const old = [
      'jieyu-backup-20261001-090000-000.jyb',
      'jieyu-backup-20261002-090000-000.jyb',
      'jieyu-backup-20261003-090000-000.jyb',
    ];
    const folder = memoryFolder([...old, 'notes.txt', 'jieyu-library-2026-10-01.jyb']);
    vi.stubGlobal('showDirectoryPicker', async () => folder.handle);

    const result = await backupLibraryToFolder(async () => new Uint8Array([1, 2, 3]));
    expect(result).toMatchObject({ folderName: 'backups', sizeBytes: 3, removed: [old[0]] });
    const kept = [...folder.files.keys()].filter((n) => n.startsWith('jieyu-backup-'));
    expect(kept).toHaveLength(BACKUP_FOLDER_KEEP);
    expect(kept).toContain(result!.fileName);
    // 不是本功能写的文件不动 | Files this feature did not write stay
    expect(folder.files.has('notes.txt')).toBe(true);
    expect(folder.files.has('jieyu-library-2026-10-01.jyb')).toBe(true);
  });

  it('a failed write removes only its partial file and keeps every older backup', async () => {
    const old = [
      'jieyu-backup-20261001-090000-000.jyb',
      'jieyu-backup-20261002-090000-000.jyb',
      'jieyu-backup-20261003-090000-000.jyb',
    ];
    const folder = memoryFolder(old, true);
    vi.stubGlobal('showDirectoryPicker', async () => folder.handle);
    await expect(backupLibraryToFolder(async () => new Uint8Array([1]))).rejects.toThrow('quota');
    expect([...folder.files.keys()].sort()).toEqual(old);
  });

  it('returns null when the user cancels the picker; names sort by time', async () => {
    vi.stubGlobal('showDirectoryPicker', async () => {
      throw new DOMException('cancel', 'AbortError');
    });
    await expect(backupLibraryToFolder(async () => new Uint8Array())).resolves.toBeNull();
    expect(backupFileName(new Date(2026, 9, 9, 7, 5, 3, 42))).toBe(
      'jieyu-backup-20261009-070503-042.jyb',
    );
  });
});
