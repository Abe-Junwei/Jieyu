import { randomUUID } from 'node:crypto';
import { isAllowedProjectFolder } from '../../desktop/skeleton/desktopSecurity';
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
): { sessionId: string } {
  if (!isAllowedProjectFolder(folder, allowed)) throw new Error('project folder refused');
  const previous = current;
  current = undefined;
  previous?.project.close();
  const project = openProject(folder);
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

export function resetDesktopSessions(): void {
  current?.project.close();
  current = undefined;
}
