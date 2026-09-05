import type { JieyuDatabase } from '../db/engine';
import type { DbIntegrityProbeResult } from '../db/dbIntegrityProbe';

export type DbResilienceFailureKind = 'open' | 'integrity';

/**
 * Resolves the boot-time DB gate after `getDb()` and optional `probeJieyuDatabaseIntegrity`.
 * Distinguishes IndexedDB open failures from post-open integrity issues for user messaging.
 */
export type DbResilienceProbeOutcome =
  | { kind: 'idle' }
  | { kind: 'failed'; failureKind: DbResilienceFailureKind; reason: string };

/**
 * Keep an explicit IndexedDB open-failure overlay. A late boot probe must not
 * replace it with idle/integrity (E2E injects open-failed after mount).
 */
export function mergeIntegrityProbeGate(
  current: DbResilienceProbeOutcome,
  next: DbResilienceProbeOutcome,
): DbResilienceProbeOutcome {
  if (current.kind === 'failed' && current.failureKind === 'open') {
    return current;
  }
  return next;
}

export async function resolveDbResilienceProbe(
  getDb: () => Promise<JieyuDatabase>,
  probe: (db: JieyuDatabase) => Promise<DbIntegrityProbeResult>,
): Promise<DbResilienceProbeOutcome> {
  try {
    const db = await getDb();
    try {
      const result = await probe(db);
      if (result.ok) {
        return { kind: 'idle' };
      }
      return { kind: 'failed', failureKind: 'integrity', reason: result.reason };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { kind: 'failed', failureKind: 'integrity', reason };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: 'failed', failureKind: 'open', reason };
  }
}
