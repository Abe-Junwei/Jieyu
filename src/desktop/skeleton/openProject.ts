import { tryAcquireProjectLock } from './projectLock';
import { syncFolderWarning, type SyncFolderWarning } from './syncFolder';
import { projectBackupDir } from './userDataLayout';

export interface OpenedProject {
  folder: string;
  warning: SyncFolderWarning | null;
  lock: 'acquired' | 'busy';
  backupDir: string | null;
}

export function openProjectFolder(input: {
  folder: string;
  extraMarkers?: readonly string[];
  userDataRoot?: string;
}): OpenedProject {
  const warning = syncFolderWarning(input.folder, input.extraMarkers ?? []);
  const lock = tryAcquireProjectLock(input.folder);
  const backupDir =
    lock.ok && input.userDataRoot
      ? projectBackupDir(input.userDataRoot, input.folder)
      : null;
  return {
    folder: input.folder,
    warning,
    lock: lock.ok ? 'acquired' : 'busy',
    backupDir,
  };
}
