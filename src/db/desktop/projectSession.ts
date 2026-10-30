import { randomUUID } from 'node:crypto';
import { resetRestoredProjectGrant } from '../../desktop/restoredProjectGrant';
import { releaseDesktopMediaSession } from '../../desktop/skeleton/desktopMediaGrant';
import { isAllowedProjectFolder } from '../../desktop/skeleton/desktopSecurity';
import { saveDailyProjectBackup } from './dailyBackup';
import { openProject, type DesktopProject } from './openProject';
import { ensureProjectIdentity } from './projectIdentity';
import { bindSessionEdit, expireSessionEdit } from './sessionEdit';

type Session = {
  id: string;
  folder: string;
  project: DesktopProject;
};

let current: Session | undefined;

export type OpenDesktopSessionResult = {
  sessionId: string;
  /** Set when the open-time daily backup was skipped so a valid project can still open (#405). */
  backupSkipped?: string;
};

export function openDesktopSession(
  folder: string,
  allowed: readonly string[],
  backup?: { dir: string; now?: Date },
  fieldValues?: Record<string, unknown>,
): OpenDesktopSessionResult {
  if (!isAllowedProjectFolder(folder, allowed)) throw new Error('project folder refused');
  const previous = current;
  current = undefined;
  previous?.project.close();
  if (previous !== undefined) releaseDesktopMediaSession(previous.id);
  expireSessionEdit();
  resetRestoredProjectGrant();
  const project = openProject(folder);
  try {
    ensureProjectIdentity(project.db, folder, fieldValues);
  } catch (error) {
    project.close();
    throw error;
  }
  const backupSkipped = skippedBackup(project, folder, backup);
  const id = randomUUID();
  current = { id, folder, project };
  bindSessionEdit(id);
  return backupSkipped === undefined ? { sessionId: id } : { sessionId: id, backupSkipped };
}

/** Opens the folder before closing the live session. A failed prepare leaves that session in place. */
export function openPreparedDesktopSession(
  folder: string,
  allowed: readonly string[],
  backup?: { dir: string; now?: Date },
): OpenDesktopSessionResult {
  if (!isAllowedProjectFolder(folder, allowed)) throw new Error('project folder refused');
  const prepared = openProject(folder);
  try {
    ensureProjectIdentity(prepared.db, folder);
  } catch (error) {
    prepared.close();
    throw error;
  }
  const backupSkipped = skippedBackup(prepared, folder, backup);
  const previous = current;
  expireSessionEdit();
  resetRestoredProjectGrant();
  const id = randomUUID();
  current = { id, folder, project: prepared };
  bindSessionEdit(id);
  if (previous !== undefined) {
    previous.project.close();
    releaseDesktopMediaSession(previous.id);
  }
  return backupSkipped === undefined ? { sessionId: id } : { sessionId: id, backupSkipped };
}

function skippedBackup(
  project: DesktopProject,
  folder: string,
  backup: { dir: string; now?: Date } | undefined,
): string | undefined {
  if (backup === undefined) return undefined;
  try {
    // now stays off IPC. A session that stays open does not write another day.
    saveDailyProjectBackup({
      db: project.db,
      folder,
      backupDir: backup.dir,
      ...(backup.now === undefined ? {} : { now: backup.now }),
    });
    return undefined;
  } catch (error) {
    // Daily backup must not block opening a valid project (oversized / missing media / bad dir).
    return error instanceof Error ? error.message : 'daily backup failed';
  }
}

export function abandonDesktopSession(): string | null {
  const id = current?.id ?? null;
  if (current === undefined) return null;
  current.project.close();
  current = undefined;
  expireSessionEdit();
  resetRestoredProjectGrant();
  return id;
}

export function closeDesktopSession(sessionId: string): void {
  if (current?.id !== sessionId) return;
  current.project.close();
  current = undefined;
  expireSessionEdit();
  resetRestoredProjectGrant();
}

export function requireDesktopSession(sessionId: string): DesktopProject {
  if (current?.id !== sessionId) throw new Error('project session expired');
  return current.project;
}

export function desktopSessionFolder(sessionId: string): string {
  if (current?.id !== sessionId) throw new Error('project session expired');
  return current.folder;
}

export function reopenDesktopSession(sessionId: string): void {
  const folder = desktopSessionFolder(sessionId);
  requireDesktopSession(sessionId).close();
  current = undefined;
  try {
    current = { id: sessionId, folder, project: openProject(folder) };
  } catch (error) {
    expireSessionEdit();
    resetRestoredProjectGrant();
    throw error;
  }
}

export function resetDesktopSessions(): void {
  current?.project.close();
  current = undefined;
  expireSessionEdit();
  resetRestoredProjectGrant();
}
