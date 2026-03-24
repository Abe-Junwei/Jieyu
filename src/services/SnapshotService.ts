import Dexie, { type Table } from 'dexie';
import type {
  UtteranceDocType,
  UtteranceTextDocType,
  TranslationLayerDocType,
} from '../db';

// ---- Types ----

interface RecoveryRow {
  /** Primary key — the main database name (e.g. "jieyudb") */
  dbName: string;
  schemaVersion: number;
  timestamp: number;
  utterances: string;     // JSON-stringified array
  translations: string;   // JSON-stringified array
  layers: string;         // JSON-stringified array
}

export interface RecoveryData {
  schemaVersion: number;
  timestamp: number;
  utterances: UtteranceDocType[];
  translations: UtteranceTextDocType[];
  layers: TranslationLayerDocType[];
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

// ---- Public API ----

export async function saveRecoverySnapshot(
  dbName: string,
  data: {
    utterances: UtteranceDocType[];
    translations: UtteranceTextDocType[];
    layers: TranslationLayerDocType[];
  },
): Promise<void> {
  const db = getRecoveryDb();
  await db.snapshots.put({
    dbName,
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    timestamp: Date.now(),
    utterances: JSON.stringify(data.utterances),
    translations: JSON.stringify(data.translations),
    layers: JSON.stringify(data.layers),
  });
}

export async function getRecoverySnapshot(dbName: string): Promise<RecoveryData | null> {
  const db = getRecoveryDb();
  const row = await db.snapshots.get(dbName);
  if (!row) return null;
  if (row.schemaVersion !== RECOVERY_SCHEMA_VERSION) return null;
  try {
    return {
      schemaVersion: row.schemaVersion,
      timestamp: row.timestamp,
      utterances: JSON.parse(row.utterances) as UtteranceDocType[],
      translations: JSON.parse(row.translations) as UtteranceTextDocType[],
      layers: JSON.parse(row.layers) as TranslationLayerDocType[],
    };
  } catch (err) {
    console.error('[SnapshotService] Corrupted recovery snapshot, cannot parse:', err);
    return null;
  }
}

export async function clearRecoverySnapshot(dbName: string): Promise<void> {
  const db = getRecoveryDb();
  await db.snapshots.delete(dbName);
}
