import Dexie, { type Table } from 'dexie';
import type { LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { exportRecoveryDatabaseAsJson, RECOVERY_EXPORT_COLLECTIONS } from '../db/io';
import { filterCollectionsForProject } from '../db/projectScopedSnapshot';
import { createLogger } from '../observability/logger';

const log = createLogger('SnapshotService');

export const RECOVERY_SCHEMA_VERSION = 2;

/** Matches `exportDatabaseAsJson` / `importDatabaseFromJson` snapshot shape (`SNAPSHOT_SCHEMA_VERSION`). */
export type RecoveryDatabaseSnapshot = Awaited<ReturnType<typeof exportRecoveryDatabaseAsJson>>;

export interface RecoveryData {
  schemaVersion: typeof RECOVERY_SCHEMA_VERSION;
  timestamp: number;
  snapshot: RecoveryDatabaseSnapshot;
}

const DEFAULT_RECOVERY_SNAPSHOT_MAX_SERIALIZED_UTF8_BYTES = 8 * 1024 * 1024;

const utf8Encoder = new TextEncoder();

export type SaveRecoverySnapshotOptions = {
  /**
   * 当前项目 textId：给出时只存这个项目的行，并按项目分开保存（方案 8.3）。
   * Current project textId: when given, only this project's rows are kept, stored per project (plan 8.3).
   */
  projectId?: string;
  /** Tests: lower ceiling to assert skip behavior without multi-megabyte fixtures. */
  maxSerializedUtf8Bytes?: number;
  /**
   * In-memory layer graph to overlay on the DB export.
   * Required when edits are dirty but not yet flushed to IndexedDB (e.g. after pushUndo).
   */
  liveLayerGraph?: {
    layer_units: LayerUnitDocType[];
    layer_unit_contents: LayerUnitContentDocType[];
    layers: LayerDocType[];
  };
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

/**
 * 按项目分开的存储键；没有项目时沿用旧的整库键。
 * Per-project storage key; without a project the legacy whole-database key is used.
 */
function recoveryKey(dbName: string, projectId?: string): string {
  const project = projectId?.trim() ?? '';
  return project.length > 0 ? `${dbName}::project::${project}` : dbName;
}

export type RecoverySnapshotSaveResult =
  | { status: 'saved'; bytes: number }
  | {
      /** 超过上限：没有写入，本项目旧的恢复快照已删除 | Over the cap: not written, the stale one was deleted */
      status: 'skipped-too-large';
      bytes: number;
      maxBytes: number;
      staleCleared: boolean;
    };

export type RecoverySnapshotSkip = {
  dbName: string;
  projectId: string | null;
  bytes: number;
  maxBytes: number;
  staleCleared: boolean;
  at: number;
};

let lastSkip: RecoverySnapshotSkip | null = null;
const skipListeners = new Set<() => void>();

function setLastSkip(next: RecoverySnapshotSkip | null): void {
  if (lastSkip === next) return;
  lastSkip = next;
  for (const listener of skipListeners) listener();
}

/** 最近一次因超限而跳过的恢复快照（界面显示“已跳过”）| Last recovery snapshot skipped for size (UI shows "skipped") */
export function getRecoverySnapshotSkip(): RecoverySnapshotSkip | null {
  return lastSkip;
}

export function subscribeRecoverySnapshotSkip(listener: () => void): () => void {
  skipListeners.add(listener);
  return () => {
    skipListeners.delete(listener);
  };
}

export function dismissRecoverySnapshotSkip(): void {
  setLastSkip(null);
}

function filterSnapshotForProject(
  snapshot: RecoveryDatabaseSnapshot,
  projectId: string,
): RecoveryDatabaseSnapshot {
  return { ...snapshot, collections: filterCollectionsForProject(snapshot.collections, projectId) };
}

async function dropCorruptedRecoverySnapshot(key: string): Promise<null> {
  try {
    const db = getRecoveryDb();
    await db.snapshots.delete(key);
  } catch {
    // ignore cleanup failures
  }
  return null;
}

function mergeDocsById<T extends { id: string }>(baseRows: unknown, liveRows: T[]): T[] {
  const base = Array.isArray(baseRows) ? (baseRows as T[]) : [];
  const byId = new Map(base.map((row) => [row.id, row]));
  for (const row of liveRows) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

/**
 * Overlay in-memory edits onto the DB export without dropping rows that only exist in IDB
 * (e.g. segment-type `layer_units` are not held in React `unitsRef`).
 */
function withLiveLayerGraphOverlay(
  snapshot: RecoveryDatabaseSnapshot,
  liveLayerGraph: NonNullable<SaveRecoverySnapshotOptions['liveLayerGraph']>,
): RecoveryDatabaseSnapshot {
  return {
    ...snapshot,
    collections: {
      ...snapshot.collections,
      layer_units: mergeDocsById(snapshot.collections['layer_units'], liveLayerGraph.layer_units),
      layer_unit_contents: mergeDocsById(
        snapshot.collections['layer_unit_contents'],
        liveLayerGraph.layer_unit_contents,
      ),
      layers: mergeDocsById(snapshot.collections['layers'], liveLayerGraph.layers),
    },
  };
}

export async function saveRecoverySnapshot(
  dbName: string,
  options?: SaveRecoverySnapshotOptions,
): Promise<RecoverySnapshotSaveResult> {
  const projectId = options?.projectId?.trim() ?? '';
  const key = recoveryKey(dbName, projectId);
  // N3 / P10：有项目时走按项目导出，避免每 3 秒读整库 | Scoped export when a project is set
  let snapshot: RecoveryDatabaseSnapshot;
  if (projectId.length > 0) {
    const { exportProjectScopedDatabaseAsJson } = await import('../db/projectScopedSnapshot');
    const scoped = await exportProjectScopedDatabaseAsJson(projectId);
    const collections: Record<string, unknown[]> = {};
    for (const name of RECOVERY_EXPORT_COLLECTIONS) {
      const rows = scoped.collections[name];
      if (Array.isArray(rows)) collections[name] = rows;
    }
    snapshot = {
      schemaVersion: scoped.schemaVersion,
      exportedAt: scoped.exportedAt,
      dbName: scoped.dbName,
      collections,
    };
  } else {
    snapshot = await exportRecoveryDatabaseAsJson();
  }
  if (options?.liveLayerGraph) {
    snapshot = withLiveLayerGraphOverlay(snapshot, options.liveLayerGraph);
  }
  const snapshotJson = JSON.stringify(snapshot);
  const maxBytes =
    options?.maxSerializedUtf8Bytes ?? DEFAULT_RECOVERY_SNAPSHOT_MAX_SERIALIZED_UTF8_BYTES;
  const total = utf8Encoder.encode(snapshotJson).byteLength;
  const db = getRecoveryDb();
  if (total > maxBytes) {
    // 旧快照比当前数据旧，留着会在崩溃后把旧内容当成“可恢复”，所以删掉（T43）
    // The stale snapshot predates current data; offering it after a crash would be misleading (T43)
    let staleCleared = false;
    try {
      const existing = await db.snapshots.get(key);
      if (existing) {
        await db.snapshots.delete(key);
        staleCleared = true;
      }
    } catch (error) {
      log.warn('saveRecoverySnapshot: failed to clear stale snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    log.warn('saveRecoverySnapshot skipped: serialized UTF-8 size exceeds limit', {
      total,
      maxBytes,
      staleCleared,
    });
    setLastSkip({
      dbName,
      projectId: projectId.length > 0 ? projectId : null,
      bytes: total,
      maxBytes,
      staleCleared,
      at: Date.now(),
    });
    return { status: 'skipped-too-large', bytes: total, maxBytes, staleCleared };
  }

  await db.snapshots.put({
    dbName: key,
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    timestamp: Date.now(),
    snapshotJson,
  });
  if (lastSkip && lastSkip.dbName === dbName && (lastSkip.projectId ?? '') === projectId) {
    setLastSkip(null);
  }
  return { status: 'saved', bytes: total };
}

async function readRecoveryRow(key: string): Promise<RecoveryData | null> {
  const db = getRecoveryDb();
  const row = await db.snapshots.get(key);
  if (!row) return null;

  if (isLegacyRecoveryRow(row)) {
    const converted = convertLegacyRowToRecoveryData(row);
    if (!converted) return dropCorruptedRecoverySnapshot(key);
    return converted;
  }

  if (!isRecoveryRowV2(row)) return dropCorruptedRecoverySnapshot(key);

  try {
    const parsed = JSON.parse(row.snapshotJson) as RecoveryDatabaseSnapshot;
    if (!parsed || typeof parsed !== 'object' || !parsed.collections) {
      return dropCorruptedRecoverySnapshot(key);
    }
    return {
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      timestamp: row.timestamp,
      snapshot: parsed,
    };
  } catch {
    return dropCorruptedRecoverySnapshot(key);
  }
}

/**
 * 读恢复快照。给出项目时读本项目的快照和升级前留下的整库快照（只取本项目的行），取较新的一份。
 * Read the recovery snapshot. With a project, read its own snapshot and any pre-upgrade
 * whole-database one (this project's rows only) and return the newer.
 */
export async function getRecoverySnapshot(
  dbName: string,
  projectId?: string,
): Promise<RecoveryData | null> {
  const project = projectId?.trim() ?? '';
  if (project.length === 0) return readRecoveryRow(dbName);
  const own = await readRecoveryRow(recoveryKey(dbName, project));
  const legacy = await readRecoveryRow(dbName);
  // 两份都在时取较新的（整库键可能是旧版本在升级后才写下的）| Newer wins when both exist
  if (!legacy || (own && own.timestamp >= legacy.timestamp)) return own;
  return { ...legacy, snapshot: filterSnapshotForProject(legacy.snapshot, project) };
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

/**
 * 清除恢复快照。给出项目时同时清掉旧的整库快照（它总是比项目快照旧，旧行为也是整库清除）。
 * Clear the recovery snapshot. With a project, the legacy whole-database row is cleared too (it is
 * always older, and the old behaviour cleared it whole as well).
 */
export async function clearRecoverySnapshot(dbName: string, projectId?: string): Promise<void> {
  const db = getRecoveryDb();
  const project = projectId?.trim() ?? '';
  if (project.length > 0) {
    await db.snapshots.delete(recoveryKey(dbName, project));
  }
  await db.snapshots.delete(dbName);
}
