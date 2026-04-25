import Dexie from 'dexie';
import type { Transaction } from 'dexie';
import { getDb, type LayerUnitContentDocType, type LayerUnitContentViewDocType, type LayerSegmentViewDocType, type LayerUnitDocType } from '../db';

/** Dexie `Transaction.table()` uses the full DB schema, so it cannot detect IDB scope — use `storeNames`. */
function readTransactionStoreNames(tx: Transaction): Set<string> {
  const sn = tx.storeNames as unknown as string[] | DOMStringList;
  if (Array.isArray(sn)) return new Set(sn);
  if (sn && typeof sn.length === 'number') {
    const list = sn as DOMStringList;
    const out = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const item = list.item(i);
      if (item) out.add(item);
    }
    return out;
  }
  return new Set();
}

/**
 * True only when `transaction` exists and its IDB scope includes every named object store.
 * When `transaction` is `null`/`undefined`, returns **false** (unknown scope — do not infer from this alone).
 * For reads that may run under a parent Dexie transaction, use `runDexieScopedReadTask`.
 */
export function dexieTransactionIncludesObjectStores(
  transaction: Transaction | null | undefined,
  tableNames: readonly string[],
): boolean {
  if (!transaction) return false;
  try {
    const stores = readTransactionStoreNames(transaction);
    return tableNames.every((name) => stores.has(name));
  } catch {
    return false;
  }
}

export function isDexieTableNotPartOfTransactionError(error: unknown): boolean {
  return error instanceof Error && /not part of transaction/i.test(error.message);
}

/**
 * Run a Dexie `Table` read task when an outer transaction may be active but not declare these stores.
 * - If `Dexie.currentTransaction` lists all `tableNames`, runs `task()` inline.
 * - If it lists a txn that omits stores, uses `Dexie.waitFor`.
 * - If `currentTransaction` is **null** (common after `await` on Safari while a parent txn is still open),
 *   tries `task()` first for the fast idle path; on `not part of transaction`, retries via `waitFor`.
 */
export async function runDexieScopedReadTask<T>(
  tableNames: readonly string[],
  task: () => Promise<T>,
  onFallbackToWaitFor: () => void,
): Promise<T> {
  const tx = Dexie.currentTransaction;
  if (tx && dexieTransactionIncludesObjectStores(tx, tableNames)) {
    return task();
  }
  if (!tx) {
    try {
      return await task();
    } catch (error) {
      if (!isDexieTableNotPartOfTransactionError(error)) throw error;
      onFallbackToWaitFor();
      return Dexie.waitFor(task as never) as Promise<T>;
    }
  }
  onFallbackToWaitFor();
  return Dexie.waitFor(task as never) as Promise<T>;
}

function sortSegments(rows: LayerSegmentViewDocType[]): LayerSegmentViewDocType[] {
  return [...rows].sort((left, right) => {
    if (left.startTime !== right.startTime) return left.startTime - right.startTime;
    if (left.endTime !== right.endTime) return left.endTime - right.endTime;
    return left.id.localeCompare(right.id);
  });
}

function projectSegmentReadModel(unit: LayerUnitDocType): LayerSegmentViewDocType {
  const unitId = unit.parentUnitId;
  const ordinal = (() => {
    const parsed = Number(unit.orderKey);
    return Number.isFinite(parsed) ? parsed : undefined;
  })();
  const annotationStatus = unit.status;

  return {
    ...unit,
    ...(unitId ? { unitId } : {}),
    ...(ordinal !== undefined ? { ordinal } : {}),
    ...(annotationStatus ? { annotationStatus } : {}),
  };
}

function projectContentReadModel(content: LayerUnitContentDocType): LayerUnitContentViewDocType {
  const unitId = content.unitId ?? content.id;
  const mediaRefId = content.mediaRefId;

  return {
    ...content,
    unitId,
    segmentId: unitId,
    ...(mediaRefId ? { mediaRefId, translationAudioMediaId: mediaRefId } : {}),
  };
}

function withSegmentStorageLayerId(
  rows: readonly LayerUnitDocType[],
  fallbackLayerId: string | undefined,
): LayerUnitDocType[] {
  const lid = fallbackLayerId?.trim() ?? '';
  if (!lid) return [...rows];
  return rows.map((row) => {
    if (row.unitType !== 'segment') return row;
    if (row.layerId?.trim()) return row;
    return { ...row, layerId: lid };
  });
}

function toSegmentViews(unitRows: readonly LayerUnitDocType[]): LayerSegmentViewDocType[] {
  return sortSegments(
    unitRows
      .filter((row) => row.unitType === 'segment')
      .map(projectSegmentReadModel),
  );
}

function filterSegmentContents(
  rows: readonly LayerUnitContentDocType[],
  options?: {
    layerId?: string;
    modality?: LayerUnitContentDocType['modality'];
  },
): LayerUnitContentViewDocType[] {
  return rows
    .map(projectContentReadModel)
    .filter((row) => {
      if (options?.layerId && row.layerId !== options.layerId) return false;
      if (options?.modality && row.modality !== options.modality) return false;
      return true;
    });
}

const warnedDexieScopeFallbacks = new Set<string>();

function warnDexieScopeFallback(tableNames: readonly string[], source: string): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return;
  const key = `${source}:${tableNames.join(',')}`;
  if (warnedDexieScopeFallbacks.has(key)) return;
  warnedDexieScopeFallbacks.add(key);
  console.warn(`[Dexie scope fallback] ${source} executed outside declared transaction stores: ${tableNames.join(', ')}`);
}

async function runQueryWithCompatibleTransaction<T>(
  tableNames: readonly string[],
  task: () => Promise<T>,
): Promise<T> {
  return runDexieScopedReadTask(tableNames, task, () => {
    warnDexieScopeFallback(tableNames, 'LayerSegmentQueryService');
  });
}

export class LayerSegmentQueryService {
  static async listSegmentsByTextId(textId: string): Promise<LayerSegmentViewDocType[]> {
    const normalized = textId.trim();
    if (!normalized) return [];

    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      const unitRows = await db.dexie.layer_units.where('textId').equals(normalized).toArray();
      return toSegmentViews(unitRows);
    });
  }

  static async listSegmentsByLayerId(layerId: string): Promise<LayerSegmentViewDocType[]> {
    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      const unitRows = await db.dexie.layer_units.where('layerId').equals(layerId).toArray();
      return toSegmentViews(withSegmentStorageLayerId(unitRows, layerId));
    });
  }

  static async listSegmentsByLayerMedia(layerId: string, mediaId: string): Promise<LayerSegmentViewDocType[]> {
    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      const unitRows = await db.dexie.layer_units.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
      return toSegmentViews(withSegmentStorageLayerId(unitRows, layerId));
    });
  }

  static async listSegmentsByIds(segmentIds: readonly string[]): Promise<LayerSegmentViewDocType[]> {
    const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      const rows = await db.dexie.layer_units.bulkGet(ids);
      return toSegmentViews(rows.filter((row): row is LayerUnitDocType => Boolean(row)));
    });
  }

  static async listUnitsByIds(unitIds: readonly string[]): Promise<LayerUnitDocType[]> {
    const ids = [...new Set(unitIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return [];

    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      const rows = await db.dexie.layer_units.bulkGet(ids);
      return rows.filter((row): row is LayerUnitDocType => Boolean(row));
    });
  }

  static async listSegmentsByParentUnitIds(parentUnitIds: readonly string[]): Promise<LayerSegmentViewDocType[]> {
    const ids = [...new Set(parentUnitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      const unitRows = await db.dexie.layer_units.where('parentUnitId').anyOf(ids).toArray();
      return toSegmentViews(unitRows);
    });
  }

  static async countUnitsByMediaId(mediaId: string): Promise<number> {
    const normalized = mediaId.trim();
    if (!normalized) return 0;

    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      return db.dexie.layer_units.where('mediaId').equals(normalized).count();
    });
  }

  static async listUnitsByMediaIds(mediaIds: readonly string[]): Promise<LayerUnitDocType[]> {
    const ids = [...new Set(mediaIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return [];

    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      return db.dexie.layer_units.where('mediaId').anyOf(ids).toArray();
    });
  }

  static async listUnitsByMediaId(mediaId: string, database?: Awaited<ReturnType<typeof getDb>>): Promise<LayerUnitDocType[]> {
    const normalized = mediaId.trim();
    if (!normalized) return [];

    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = database ?? await getDb();
      return db.dexie.layer_units.where('mediaId').equals(normalized).toArray();
    });
  }

  static async listAllSegments(): Promise<LayerSegmentViewDocType[]> {
    return runQueryWithCompatibleTransaction(['layer_units'], async () => {
      const db = await getDb();
      const unitRows = await db.dexie.layer_units.where('unitType').equals('segment').toArray();
      return toSegmentViews(unitRows);
    });
  }

  static async listSegmentContentsByIds(contentIds: readonly string[]): Promise<LayerUnitContentViewDocType[]> {
    const ids = [...new Set(contentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    return runQueryWithCompatibleTransaction(['layer_unit_contents'], async () => {
      const db = await getDb();
      const rows = await db.dexie.layer_unit_contents.bulkGet(ids);
      return filterSegmentContents(rows.filter((row): row is LayerUnitContentDocType => Boolean(row)));
    });
  }

  static async listSegmentContentsBySegmentIds(
    segmentIds: readonly string[],
    options?: {
      layerId?: string;
      modality?: LayerUnitContentDocType['modality'];
    },
  ): Promise<LayerUnitContentViewDocType[]> {
    const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    return runQueryWithCompatibleTransaction(['layer_unit_contents'], async () => {
      const db = await getDb();
      const rows = await db.dexie.layer_unit_contents.where('unitId').anyOf(ids).toArray();
      return filterSegmentContents(rows, options);
    });
  }

  static async countSegmentContentsByLayerId(layerId: string): Promise<number> {
    if (!layerId.trim()) return 0;
    return runQueryWithCompatibleTransaction(['layer_unit_contents'], async () => {
      const db = await getDb();
      return db.dexie.layer_unit_contents.where('layerId').equals(layerId).count();
    });
  }
}