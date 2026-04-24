import { getDb, type JieyuDatabase } from './engine';

export type DbIntegrityProbeResult = { ok: true } | { ok: false; reason: string };

function toReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'unknown-error';
}

/**
 * 轻量探测关键表是否可读（F-2）。失败不修改数据库。
 * Lightweight read probe for critical tables (F-2). Does not mutate the database.
 */
export async function probeJieyuDatabaseIntegrity(database: JieyuDatabase): Promise<DbIntegrityProbeResult> {
  try {
    await database.dexie.texts.limit(1).toArray();
    await database.dexie.layer_units.limit(1).toArray();
    await database.dexie.tier_definitions.limit(1).toArray();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}

/** `getDb()` 单例上的轻量健康读（F-2 / ARCH-4）| Lightweight read health on the `getDb()` singleton. */
export async function jieyuDatabaseSingletonHealthCheck(): Promise<DbIntegrityProbeResult> {
  return probeJieyuDatabaseIntegrity(await getDb());
}
