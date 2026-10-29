import { randomUUID } from 'node:crypto';
import { releaseDesktopMediaSession } from '../../desktop/skeleton/desktopMediaGrant';
import { isAllowedProjectFolder } from '../../desktop/skeleton/desktopSecurity';
import { saveDailyProjectBackup } from './dailyBackup';
import { openProject, type DesktopProject } from './openProject';
import { ensureProjectIdentity } from './projectIdentity';
import type { SpeakerAssignUndo } from './speakerAssign';
import type { UnitMergeUndo, UnitSplitUndo } from './unitSpan';
import type { UnitTextUndo } from './units';

type Session = {
  id: string;
  folder: string;
  project: DesktopProject;
};

type SessionStep =
  | { kind: 'text'; undo: UnitTextUndo }
  | { kind: 'split'; undo: UnitSplitUndo }
  | { kind: 'merge'; undo: UnitMergeUndo }
  | { kind: 'assign'; undo: SpeakerAssignUndo };

let current: Session | undefined;
let step: { sessionId: string; step: SessionStep } | undefined;

export type OpenDesktopSessionResult = {
  sessionId: string;
  /** Set when the open-time daily backup was skipped so a valid project can still open (#405). */
  backupSkipped?: string;
};

export function openDesktopSession(
  folder: string,
  allowed: readonly string[],
  backup?: { dir: string; now?: Date },
): OpenDesktopSessionResult {
  if (!isAllowedProjectFolder(folder, allowed)) throw new Error('project folder refused');
  const previous = current;
  current = undefined;
  previous?.project.close();
  if (previous !== undefined) releaseDesktopMediaSession(previous.id);
  clearUnitTextUndo();
  const project = openProject(folder);
  try {
    ensureProjectIdentity(project.db, folder);
  } catch (error) {
    project.close();
    throw error;
  }
  let backupSkipped: string | undefined;
  if (backup) {
    try {
      // now stays off IPC. A session that stays open does not write another day.
      saveDailyProjectBackup({
        db: project.db,
        folder,
        backupDir: backup.dir,
        ...(backup.now === undefined ? {} : { now: backup.now }),
      });
    } catch (error) {
      // Daily backup must not block opening a valid project (oversized / missing media / bad dir).
      backupSkipped = error instanceof Error ? error.message : 'daily backup failed';
    }
  }
  const id = randomUUID();
  current = { id, folder, project };
  return backupSkipped === undefined ? { sessionId: id } : { sessionId: id, backupSkipped };
}

export function abandonDesktopSession(): string | null {
  const id = current?.id ?? null;
  if (current === undefined) return null;
  current.project.close();
  current = undefined;
  clearUnitTextUndo();
  return id;
}

export function closeDesktopSession(sessionId: string): void {
  if (current?.id !== sessionId) return;
  current.project.close();
  current = undefined;
  clearUnitTextUndo();
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
  clearUnitTextUndo();
}

export function rememberUnitTextUndo(sessionId: string, undo: UnitTextUndo): void {
  rememberStep(sessionId, { kind: 'text', undo });
}

export function rememberUnitSplitUndo(sessionId: string, undo: UnitSplitUndo): void {
  rememberStep(sessionId, { kind: 'split', undo });
}

export function rememberUnitMergeUndo(sessionId: string, undo: UnitMergeUndo): void {
  rememberStep(sessionId, { kind: 'merge', undo });
}

export function rememberUnitAssignUndo(sessionId: string, undo: SpeakerAssignUndo): void {
  rememberStep(sessionId, { kind: 'assign', undo });
}

export function peekUnitStep(sessionId: string): SessionStep | null {
  if (current?.id !== sessionId || step?.sessionId !== sessionId) return null;
  return step.step;
}

export function clearUnitTextUndo(sessionId?: string): void {
  if (sessionId === undefined || step?.sessionId === sessionId) step = undefined;
}

function rememberStep(sessionId: string, next: SessionStep): void {
  if (current?.id !== sessionId) return;
  step = { sessionId, step: next };
}
