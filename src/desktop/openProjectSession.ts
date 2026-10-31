let sessionId: string | null = null;

export function rememberOpenProjectSession(id: string): void {
  sessionId = id;
}

export function readOpenProjectSession(): string | null {
  return sessionId;
}

export function forgetOpenProjectSession(): void {
  sessionId = null;
}
