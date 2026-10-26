/**
 * 主进程打开已锁定项目文件夹上的两份库，并按一次方法调用转发（ADR-0079）。
 * userData 文件由调用方传入，不在项目文件夹里。
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { callStorageMethod } from '../../db/ipcStoragePort';
import { PROJECT_APPLICATION_ID } from '../../db/sqliteSpeakerAssignment';
import { openSqliteStoragePort } from '../../db/sqliteStoragePort';
import { projectFolderLockedByThisProcess } from './projectLock';

interface OpenHandle {
  port: object;
  close: () => void;
  folder: string;
  userDataFile: string;
}

let current: OpenHandle | undefined;

function assertProjectFolderLocked(folder: string): void {
  if (!projectFolderLockedByThisProcess(folder)) throw new Error('project folder is not locked');
}

function assertUserDataOutsideProject(file: string, projectDir: string): void {
  const relative = path.relative(path.resolve(projectDir), path.resolve(file));
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('user data sqlite is inside the project folder');
  }
}

export function writeProjectLibraryMarker(file: string): void {
  const db = new Database(file);
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec(`PRAGMA application_id = ${PROJECT_APPLICATION_ID}`);
    db.exec('PRAGMA user_version = 1');
  } finally {
    db.close();
  }
}

export function closeLockedSqliteStorage(): void {
  current?.close();
  current = undefined;
}

export function openLockedSqliteStorage(input: { folder: string; userDataFile: string }): void {
  assertProjectFolderLocked(input.folder);
  assertUserDataOutsideProject(input.userDataFile, input.folder);
  const previous = current;
  current = undefined;
  previous?.close();
  const opened = openSqliteStoragePort(input.userDataFile, input.folder);
  current = {
    port: opened.port,
    close: opened.close,
    folder: input.folder,
    userDataFile: input.userDataFile,
  };
}

export function reopenLockedSqliteStorage(): void {
  if (current === undefined) throw new Error('sqlite storage port is not open');
  const { folder, userDataFile } = current;
  current.close();
  current = undefined;
  const opened = openSqliteStoragePort(userDataFile, folder);
  current = { port: opened.port, close: opened.close, folder, userDataFile };
}

export function callLockedSqliteStorage(
  method: string,
  args: readonly unknown[],
): Promise<unknown> {
  if (current === undefined) return Promise.reject(new Error('sqlite storage port is not open'));
  return callStorageMethod(current.port, method, args);
}
