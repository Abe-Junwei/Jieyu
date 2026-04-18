import { getDb, type LayerUnitContentDocType, type LayerUnitContentViewDocType, type LayerSegmentViewDocType, type LayerUnitDocType } from '../db';

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

export class LayerSegmentQueryService {
  static async listSegmentsByTextId(textId: string): Promise<LayerSegmentViewDocType[]> {
    const normalized = textId.trim();
    if (!normalized) return [];

    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('textId').equals(normalized).toArray();
    return toSegmentViews(unitRows);
  }

  static async listSegmentsByLayerId(layerId: string): Promise<LayerSegmentViewDocType[]> {
    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('layerId').equals(layerId).toArray();
    return toSegmentViews(withSegmentStorageLayerId(unitRows, layerId));
  }

  static async listSegmentsByLayerMedia(layerId: string, mediaId: string): Promise<LayerSegmentViewDocType[]> {
    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
    return toSegmentViews(withSegmentStorageLayerId(unitRows, layerId));
  }

  static async listSegmentsByIds(segmentIds: readonly string[]): Promise<LayerSegmentViewDocType[]> {
    const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = await getDb();
    const rows = await db.dexie.layer_units.bulkGet(ids);
    return toSegmentViews(rows.filter((row): row is LayerUnitDocType => Boolean(row)));
  }

  static async listSegmentsByParentUnitIds(parentUnitIds: readonly string[]): Promise<LayerSegmentViewDocType[]> {
    const ids = [...new Set(parentUnitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('parentUnitId').anyOf(ids).toArray();
    return toSegmentViews(unitRows);
  }

  static async listAllSegments(): Promise<LayerSegmentViewDocType[]> {
    const db = await getDb();
    const unitRows = await db.dexie.layer_units.where('unitType').equals('segment').toArray();
    return toSegmentViews(unitRows);
  }

  static async listSegmentContentsByIds(contentIds: readonly string[]): Promise<LayerUnitContentViewDocType[]> {
    const ids = [...new Set(contentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = await getDb();
    const rows = await db.dexie.layer_unit_contents.bulkGet(ids);
    return filterSegmentContents(rows.filter((row): row is LayerUnitContentDocType => Boolean(row)));
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

    const db = await getDb();
    const rows = await db.dexie.layer_unit_contents.where('unitId').anyOf(ids).toArray();
    return filterSegmentContents(rows, options);
  }

  static async countSegmentContentsByLayerId(layerId: string): Promise<number> {
    if (!layerId.trim()) return 0;
    const db = await getDb();
    return db.dexie.layer_unit_contents.where('layerId').equals(layerId).count();
  }
}