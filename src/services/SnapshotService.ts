import Dexie, { type Table } from 'dexie';
import type { LayerUnitDocType, LayerUnitContentDocType, LayerDocType } from '../db';

// ---- Types ----

interface RecoveryRow {
  /** Primary key — the main Dexie database name (see `JIEYU_DEXIE_DB_NAME` in `src/db/engine.ts`) */
  dbName: string;
  schemaVersion: number;
  timestamp: number;
  units: string;     // JSON-stringified array
  translations: string;   // JSON-stringified array
  layers: string;         // JSON-stringified array
}

export interface RecoveryData {
  schemaVersion: number;
  timestamp: number;
  units: LayerUnitDocType[];
  translations: LayerUnitContentDocType[];
  layers: LayerDocType[];
}

const RECOVERY_SCHEMA_VERSION = 1;

/** Combined UTF-8 size of serialized units + translations + layers; larger payloads skip persist. */
const DEFAULT_RECOVERY_SNAPSHOT_MAX_SERIALIZED_UTF8_BYTES = 8 * 1024 * 1024;

const utf8Encoder = new TextEncoder();

function combinedSerializedUtf8Length(units: string, translations: string, layers: string): number {
  return utf8Encoder.encode(units).byteLength
    + utf8Encoder.encode(translations).byteLength
    + utf8Encoder.encode(layers).byteLength;
}

export type SaveRecoverySnapshotOptions = {
  /** Tests: lower ceiling to assert skip behavior without multi-megabyte fixtures. */
  maxSerializedUtf8Bytes?: number;
};

// ---- Private Dexie DB (separate from main db) ----

class RecoveryDexie extends Dexie {
  snapshots!: Table<RecoveryRow, string>;
  constructor() {
    super('jieyu_recovery');
    this.version(1).stores({ snapshots: 'dbName' });
  }
}

let _recoveryDb: RecoveryDexie | undefined;
function getRecoveryDb(): RecoveryDexie {
  if (!_recoveryDb) _recoveryDb = new RecoveryDexie();
  return _recoveryDb;
}

function serializeRecoveryArray<T>(value: T[] | undefined): string {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

async function dropCorruptedRecoverySnapshot(dbName: string): Promise<null> {
  try {
    const db = getRecoveryDb();
    await db.snapshots.delete(dbName);
  } catch {
    // 忽略兜底清理失败，避免恢复流程再次抛错 | Ignore cleanup failures to keep recovery non-blocking.
  }
  return null;
}

// ---- Public API ----

export async function saveRecoverySnapshot(
  dbName: string,
  data: {
    units: LayerUnitDocType[];
    translations: LayerUnitContentDocType[];
    layers: LayerDocType[];
  },
  options?: SaveRecoverySnapshotOptions,
): Promise<void> {
  const units = serializeRecoveryArray(data.units);
  const translations = serializeRecoveryArray(data.translations);
  const layers = serializeRecoveryArray(data.layers);
  const maxBytes = options?.maxSerializedUtf8Bytes ?? DEFAULT_RECOVERY_SNAPSHOT_MAX_SERIALIZED_UTF8_BYTES;
  const total = combinedSerializedUtf8Length(units, translations, layers);
  if (total > maxBytes) {
    console.debug(
      `[SnapshotService] saveRecoverySnapshot skipped: serialized UTF-8 size ${total} exceeds limit ${maxBytes}`,
    );
    // 超限时清掉旧快照，避免后续恢复到陈旧状态 | Clear any older snapshot to avoid stale crash recovery.
    await clearRecoverySnapshot(dbName);
    return;
  }

  const db = getRecoveryDb();
  await db.snapshots.put({
    dbName,
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    timestamp: Date.now(),
    units,
    translations,
    layers,
  });
}

export async function getRecoverySnapshot(dbName: string): Promise<RecoveryData | null> {
  const db = getRecoveryDb();
  const row = await db.snapshots.get(dbName);
  if (!row) return null;
  if (row.schemaVersion !== RECOVERY_SCHEMA_VERSION) return dropCorruptedRecoverySnapshot(dbName);
  try {
    const units = JSON.parse(typeof row.units === 'string' ? row.units : '[]') as LayerUnitDocType[];
    const translations = JSON.parse(typeof row.translations === 'string' ? row.translations : '[]') as LayerUnitContentDocType[];
    const layers = JSON.parse(typeof row.layers === 'string' ? row.layers : '[]') as LayerDocType[];

    if (!Array.isArray(units) || !Array.isArray(translations) || !Array.isArray(layers)) {
      return dropCorruptedRecoverySnapshot(dbName);
    }

    return {
      schemaVersion: row.schemaVersion,
      timestamp: row.timestamp,
      units,
      translations,
      layers,
    };
  } catch {
    return dropCorruptedRecoverySnapshot(dbName);
  }
}

export async function clearRecoverySnapshot(dbName: string): Promise<void> {
  const db = getRecoveryDb();
  await db.snapshots.delete(dbName);
}
