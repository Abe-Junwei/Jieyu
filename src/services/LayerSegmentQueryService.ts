import {
  getDb,
  type LayerSegmentContentDocType,
  type LayerSegmentDocType,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
} from '../db';
import {
  toLegacySegmentContentFromLayerUnitContent,
  toLegacySegmentFromLayerUnit,
} from './LayerUnitLegacyProjection';

function sortSegments(rows: LayerSegmentDocType[]): LayerSegmentDocType[] {
  return [...rows].sort((left, right) => {
    if (left.startTime !== right.startTime) return left.startTime - right.startTime;
    if (left.endTime !== right.endTime) return left.endTime - right.endTime;
    return left.id.localeCompare(right.id);
  });
}

function toLegacySegments(unitRows: readonly LayerUnitDocType[]): LayerSegmentDocType[] {
  return sortSegments(
    unitRows
      .filter((row) => row.unitType === 'segment')
      .map(toLegacySegmentFromLayerUnit),
  );
}

function filterLegacySegmentContents(
  rows: readonly LayerUnitContentDocType[],
  options?: {
    layerId?: string;
    modality?: LayerSegmentContentDocType['modality'];
  },
): LayerSegmentContentDocType[] {
  return rows
    .map(toLegacySegmentContentFromLayerUnitContent)
    .filter((row) => {
      if (options?.layerId && row.layerId !== options.layerId) return false;
      if (options?.modality && row.modality !== options.modality) return false;
      return true;
    });
}

export class LayerSegmentQueryService {
  static async listSegmentsByLayerId(layerId: string): Promise<LayerSegmentDocType[]> {
    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('layerId').equals(layerId).toArray();
    return toLegacySegments(unitRows);
  }

  static async listSegmentsByLayerMedia(layerId: string, mediaId: string): Promise<LayerSegmentDocType[]> {
    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
    return toLegacySegments(unitRows);
  }

  static async listSegmentsByIds(segmentIds: readonly string[]): Promise<LayerSegmentDocType[]> {
    const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = await getDb();
    const rows = await db.dexie.layer_units.bulkGet(ids);
    return toLegacySegments(rows.filter((row): row is LayerUnitDocType => Boolean(row)));
  }

  static async listSegmentsByParentUnitIds(parentUnitIds: readonly string[]): Promise<LayerSegmentDocType[]> {
    const ids = [...new Set(parentUnitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('parentUnitId').anyOf(ids).toArray();
    return toLegacySegments(unitRows);
  }

  static async listAllSegments(): Promise<LayerSegmentDocType[]> {
    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('unitType').equals('segment').toArray();
    return toLegacySegments(unitRows);
  }

  static async listSegmentContentsByIds(contentIds: readonly string[]): Promise<LayerSegmentContentDocType[]> {
    const ids = [...new Set(contentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = await getDb();
    const rows = await db.dexie.layer_unit_contents.bulkGet(ids);
    return filterLegacySegmentContents(rows.filter((row): row is LayerUnitContentDocType => Boolean(row)));
  }

  static async listSegmentContentsBySegmentIds(
    segmentIds: readonly string[],
    options?: {
      layerId?: string;
      modality?: LayerSegmentContentDocType['modality'];
    },
  ): Promise<LayerSegmentContentDocType[]> {
    const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = await getDb();
    const rows = await db.dexie.layer_unit_contents.where('unitId').anyOf(ids).toArray();
    return filterLegacySegmentContents(rows, options);
  }

  static async countSegmentContentsByLayerId(layerId: string): Promise<number> {
    if (!layerId.trim()) return 0;
    const db = await getDb();
    return db.dexie.layer_unit_contents.where('layerId').equals(layerId).count();
  }
}