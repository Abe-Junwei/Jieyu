import Dexie, { type Table } from 'dexie';
import type { LayerUnitDocType, LayerUnitContentDocType, LayerDocType } from '../db';

// ---- Types ----

interface RecoveryRow {
  /** Primary key — the main database name (e.g. "jieyudb") */
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
): Promise<void> {
  const db = getRecoveryDb();
  await db.snapshots.put({
    dbName,
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    timestamp: Date.now(),
    units: serializeRecoveryArray(data.units),
    translations: serializeRecoveryArray(data.translations),
    layers: serializeRecoveryArray(data.layers),
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
