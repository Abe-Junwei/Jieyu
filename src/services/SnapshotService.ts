import Dexie, { type Table } from 'dexie';
import type { LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { exportRecoveryDatabaseAsJson } from '../db/io';
import { createLogger } from '../observability/logger';

const log = createLogger('SnapshotService');

export const RECOVERY_SCHEMA_VERSION = 2;

/** Matches `exportDatabaseAsJson` / `importDatabaseFromJson` snapshot shape (schemaVersion 4). */
export type RecoveryDatabaseSnapshot = Awaited<ReturnType<typeof exportRecoveryDatabaseAsJson>>;

export interface RecoveryData {
  schemaVersion: typeof RECOVERY_SCHEMA_VERSION;
  timestamp: number;
  snapshot: RecoveryDatabaseSnapshot;
}

const DEFAULT_RECOVERY_SNAPSHOT_MAX_SERIALIZED_UTF8_BYTES = 8 * 1024 * 1024;

const utf8Encoder = new TextEncoder();

export type SaveRecoverySnapshotOptions = {
  /** Tests: lower ceiling to assert skip behavior without multi-megabyte fixtures. */
  maxSerializedUtf8Bytes?: number;
};

/** In-memory layer graph not yet flushed to Dexie; merged over DB export when saving recovery. */
export type SaveRecoverySnapshotOverlay = {
  units: LayerUnitDocType[];
  translations: LayerUnitContentDocType[];
  layers: LayerDocType[];
};

interface LegacyRecoveryRow {
  dbName: string;
  schemaVersion: number;
  timestamp: number;
  units: string;
  translations: string;
  layers: string;
}

interface RecoveryRowV2 {
  dbName: string;
  schemaVersion: typeof RECOVERY_SCHEMA_VERSION;
  timestamp: number;
  snapshotJson: string;
}

type RecoveryRow = LegacyRecoveryRow | RecoveryRowV2;

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

function isLegacyRecoveryRow(row: RecoveryRow): row is LegacyRecoveryRow {
  return row.schemaVersion === 1 && 'units' in row;
}

function isRecoveryRowV2(row: RecoveryRow): row is RecoveryRowV2 {
  return row.schemaVersion === RECOVERY_SCHEMA_VERSION && 'snapshotJson' in row;
}

function layerUnitsFromSnapshot(snapshot: RecoveryDatabaseSnapshot): LayerUnitDocType[] {
  const rows = snapshot.collections['layer_units'];
  return Array.isArray(rows) ? (rows as LayerUnitDocType[]) : [];
}

function convertLegacyRowToRecoveryData(row: LegacyRecoveryRow): RecoveryData | null {
  try {
    const units = JSON.parse(
      typeof row.units === 'string' ? row.units : '[]',
    ) as LayerUnitDocType[];
    const translations = JSON.parse(typeof row.translations === 'string' ? row.translations : '[]');
    const layers = JSON.parse(typeof row.layers === 'string' ? row.layers : '[]');
    if (!Array.isArray(units) || !Array.isArray(translations) || !Array.isArray(layers)) {
      return null;
    }
    return {
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      timestamp: row.timestamp,
      snapshot: {
        schemaVersion: 4,
        exportedAt: new Date(row.timestamp).toISOString(),
        dbName: row.dbName,
        collections: {
          layer_units: units,
          layer_unit_contents: translations,
          layers,
        },
      },
    };
  } catch {
    return null;
  }
}

async function dropCorruptedRecoverySnapshot(dbName: string): Promise<null> {
  try {
    const db = getRecoveryDb();
    await db.snapshots.delete(dbName);
  } catch {
    // ignore cleanup failures
  }
  return null;
}

function applyRecoveryOverlay(
  snapshot: RecoveryDatabaseSnapshot,
  overlay: SaveRecoverySnapshotOverlay,
): RecoveryDatabaseSnapshot {
  return {
    ...snapshot,
    collections: {
      ...snapshot.collections,
      layer_units: overlay.units,
      layer_unit_contents: overlay.translations,
      layers: overlay.layers,
    },
  };
}

export async function saveRecoverySnapshot(
  dbName: string,
  overlay?: SaveRecoverySnapshotOverlay,
  options?: SaveRecoverySnapshotOptions,
): Promise<void> {
  let snapshot = await exportRecoveryDatabaseAsJson();
  if (overlay) {
    snapshot = applyRecoveryOverlay(snapshot, overlay);
  }
  const snapshotJson = JSON.stringify(snapshot);
  const maxBytes =
    options?.maxSerializedUtf8Bytes ?? DEFAULT_RECOVERY_SNAPSHOT_MAX_SERIALIZED_UTF8_BYTES;
  const total = utf8Encoder.encode(snapshotJson).byteLength;
  if (total > maxBytes) {
    log.debug('saveRecoverySnapshot skipped: serialized UTF-8 size exceeds limit', {
      total,
      maxBytes,
    });
    await clearRecoverySnapshot(dbName);
    return;
  }

  const db = getRecoveryDb();
  await db.snapshots.put({
    dbName,
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    timestamp: Date.now(),
    snapshotJson,
  });
}

export async function getRecoverySnapshot(dbName: string): Promise<RecoveryData | null> {
  const db = getRecoveryDb();
  const row = await db.snapshots.get(dbName);
  if (!row) return null;

  if (isLegacyRecoveryRow(row)) {
    const converted = convertLegacyRowToRecoveryData(row);
    if (!converted) return dropCorruptedRecoverySnapshot(dbName);
    return converted;
  }

  if (!isRecoveryRowV2(row)) return dropCorruptedRecoverySnapshot(dbName);

  try {
    const parsed = JSON.parse(row.snapshotJson) as RecoveryDatabaseSnapshot;
    if (!parsed || typeof parsed !== 'object' || !parsed.collections) {
      return dropCorruptedRecoverySnapshot(dbName);
    }
    return {
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      timestamp: row.timestamp,
      snapshot: parsed,
    };
  } catch {
    return dropCorruptedRecoverySnapshot(dbName);
  }
}

export function getRecoveryLayerUnits(data: RecoveryData): LayerUnitDocType[] {
  return layerUnitsFromSnapshot(data.snapshot);
}

export function getRecoveryLayerContents(data: RecoveryData): LayerUnitContentDocType[] {
  const rows = data.snapshot.collections['layer_unit_contents'];
  return Array.isArray(rows) ? (rows as LayerUnitContentDocType[]) : [];
}

export function getRecoveryLayers(data: RecoveryData): LayerDocType[] {
  const rows = data.snapshot.collections['layers'];
  return Array.isArray(rows) ? (rows as LayerDocType[]) : [];
}

export async function clearRecoverySnapshot(dbName: string): Promise<void> {
  const db = getRecoveryDb();
  await db.snapshots.delete(dbName);
}
