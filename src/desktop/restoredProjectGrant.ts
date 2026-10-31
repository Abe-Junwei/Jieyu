import path from 'node:path';

let grant: { sessionId: string; folder: string } | null = null;

/** Remember the folder this restore just wrote. The renderer does not send a path back. */
export function grantRestoredProject(sessionId: string, folder: string): void {
  grant = { sessionId, folder: path.resolve(folder) };
}

export function readRestoredProjectGrant(sessionId: string): string {
  if (grant === null || grant.sessionId !== sessionId) {
    throw new Error('restored project is not granted');
  }
  return grant.folder;
}

export function resetRestoredProjectGrant(): void {
  grant = null;
}
