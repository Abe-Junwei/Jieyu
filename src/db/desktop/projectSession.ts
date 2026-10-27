import { randomUUID } from 'node:crypto';
import { isAllowedProjectFolder } from '../../desktop/skeleton/desktopSecurity';
import { saveDailyProjectBackup } from './dailyBackup';
import { openProject, type DesktopProject } from './openProject';

type Session = {
  id: string;
  folder: string;
  project: DesktopProject;
};

let current: Session | undefined;

export function openDesktopSession(
  folder: string,
  allowed: readonly string[],
  backup?: { dir: string; now?: Date },
): { sessionId: string } {
  if (!isAllowedProjectFolder(folder, allowed)) throw new Error('project folder refused');
  const previous = current;
  current = undefined;
  previous?.project.close();
  const project = openProject(folder);
  try {
    // now stays off IPC. A session that stays open does not write another day.
    if (backup) {
      saveDailyProjectBackup({
        db: project.db,
        folder,
        backupDir: backup.dir,
        ...(backup.now === undefined ? {} : { now: backup.now }),
      });
    }
  } catch (error) {
    project.close();
    throw error;
  }
  const id = randomUUID();
  current = { id, folder, project };
  return { sessionId: id };
}

export function closeDesktopSession(sessionId: string): void {
  if (current?.id !== sessionId) return;
  current.project.close();
  current = undefined;
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
  current = { id: sessionId, folder, project: openProject(folder) };
}

export function resetDesktopSessions(): void {
  current?.project.close();
  current = undefined;
}
