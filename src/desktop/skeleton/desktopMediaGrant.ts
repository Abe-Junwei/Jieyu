import { randomUUID } from 'node:crypto';

type Grant = { sessionId: string; filePath: string };

const grants = new Map<string, Grant>();
let bound: string | undefined;

export function bindDesktopMediaSession(sessionId: string): void {
  if (bound === sessionId) return;
  bound = sessionId;
  grants.clear();
}

export function releaseDesktopMediaSession(sessionId: string): void {
  if (bound !== sessionId) return;
  bound = undefined;
  grants.clear();
}

export function grantDesktopMedia(sessionId: string, filePath: string): string {
  if (bound !== sessionId) throw new Error('project session expired');
  const token = randomUUID();
  grants.set(token, { sessionId, filePath });
  return token;
}

export function resolveDesktopMedia(token: string): string | null {
  const grant = grants.get(token);
  if (!grant || grant.sessionId !== bound) return null;
  return grant.filePath;
}

export function resetDesktopMediaGrants(): void {
  bound = undefined;
  grants.clear();
}
