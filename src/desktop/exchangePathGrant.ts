import { randomUUID } from 'node:crypto';
import path from 'node:path';

export type ExchangePathPurpose = 'import' | 'import-roles' | 'export';

type Grant = { sessionId: string; file: string; purpose: ExchangePathPurpose };

const grants = new Map<string, Grant>();

/** Store a dialog-chosen path. Renderer receives only the grant id. */
export function grantExchangePath(
  sessionId: string,
  file: string,
  purpose: ExchangePathPurpose,
): string {
  const id = randomUUID();
  grants.set(id, { sessionId, file: path.resolve(file), purpose });
  return id;
}

/** One-shot consume: path is valid only for this sessionId + purpose. */
export function consumeExchangePath(
  sessionId: string,
  grantId: string,
  purpose: ExchangePathPurpose,
): string {
  const grant = grants.get(grantId);
  if (!grant || grant.sessionId !== sessionId || grant.purpose !== purpose) {
    throw new Error('exchange path is not granted');
  }
  grants.delete(grantId);
  return grant.file;
}

export function resetExchangePathGrants(): void {
  grants.clear();
}
