import { getDb } from './engine';
import { dexieStoresForLayerUnitsTableRead } from './dexieTranscriptionGraphStores';
import { StorageReadbackError } from './storageReadbackError';
import type {
  AnchorDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
} from './types';
import { withTransaction } from './withTransaction';
import { invalidateUnitEmbeddings } from '../ai/embeddings/EmbeddingInvalidationService';
import { LayerUnitSegmentWriteService } from '../services/LayerUnitSegmentWriteService';
import {
  getUnitDocProjectionById,
  listUnitDocsForMedia,
} from '../services/LayerSegmentGraphService';
import {
  getSegmentationV2Ids,
  listUnitTextsByUnit,
  listUnitTextsByUnits,
  removeUnitTextFromSegmentationV2,
  syncUnitTextToSegmentationV2,
} from '../services/LayerSegmentationTextService';

export async function readTranscriptionUnitById(unitId: string): Promise<LayerUnitDocType | null> {
  const id = unitId.trim();
  if (id.length === 0) return null;
  const database = await getDb();
  return (await getUnitDocProjectionById(database, id)) ?? null;
}

export async function readTranscriptionUnitsForMedia(mediaId: string): Promise<LayerUnitDocType[]> {
  const id = mediaId.trim();
  if (id.length === 0) return [];
  const database = await getDb();
  return listUnitDocsForMedia(database, id);
}

export async function readTranscriptionLayerUnitsByIds(
  ids: readonly string[],
): Promise<LayerUnitDocType[]> {
  if (ids.length === 0) return [];
  const database = await getDb();
  return withTransaction(
    database,
    'r',
    dexieStoresForLayerUnitsTableRead(database),
    async () => {
      const rows = await database.dexie.layer_units.bulkGet([...ids]);
      return rows.filter((row): row is LayerUnitDocType => row !== undefined);
    },
    { label: 'readTranscriptionLayerUnitsByIds' },
  );
}

export async function readTranscriptionMediaById(
  id: string,
): Promise<MediaItemDocType | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.media_items.get(key);
}

export async function readTranscriptionContentById(
  id: string,
): Promise<LayerUnitContentDocType | undefined> {
  const key = id.trim();
  if (key.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.layer_unit_contents.get(key);
}

export async function upsertTranscriptionSegments(
  segments: readonly LayerUnitDocType[],
): Promise<void> {
  if (segments.length === 0) return;
  const database = await getDb();
  await LayerUnitSegmentWriteService.upsertSegments(database, segments);
  const ids = segments.map((row) => row.id);
  const stored = await database.dexie.layer_units.bulkGet(ids);
  for (let index = 0; index < ids.length; index += 1) {
    const row = stored[index];
    if (!row || row.id !== ids[index])
      throw new StorageReadbackError('upsertTranscriptionSegments');
  }
}

export async function listTranscriptionUnitTexts(unitId: string) {
  const database = await getDb();
  return listUnitTextsByUnit(database, unitId);
}

export async function listTranscriptionUnitTextsForUnits(unitIds: readonly string[]) {
  const database = await getDb();
  return listUnitTextsByUnits(database, unitIds);
}

export async function syncTranscriptionUnitText(
  unit: LayerUnitDocType,
  translation: LayerUnitContentDocType,
): Promise<void> {
  const database = await getDb();
  await syncUnitTextToSegmentationV2(database, unit, translation);
  const ids = getSegmentationV2Ids(translation.layerId?.trim() ?? '', unit.id, translation.id);
  const stored = await database.dexie.layer_unit_contents.get(ids.segmentContentId);
  if (!stored || stored.id !== ids.segmentContentId) {
    throw new StorageReadbackError('syncTranscriptionUnitText');
  }
}

export async function removeTranscriptionUnitText(
  translation: Pick<LayerUnitContentDocType, 'id' | 'layerId' | 'unitId'>,
): Promise<void> {
  const database = await getDb();
  await removeUnitTextFromSegmentationV2(database, translation);
  const layerId = translation.layerId?.trim() ?? '';
  const unitId = translation.unitId?.trim() ?? '';
  const translationId = translation.id.trim();
  if (translationId.length === 0) return;
  const ids = getSegmentationV2Ids(layerId, unitId, translationId);
  const stored = await database.dexie.layer_unit_contents.get(ids.segmentContentId);
  if (stored) throw new StorageReadbackError('removeTranscriptionUnitText');
}

export async function invalidateTranscriptionUnitEmbeddings(
  unitIds: readonly string[],
): Promise<void> {
  const database = await getDb();
  const removedIds = await invalidateUnitEmbeddings(database, unitIds);
  if (removedIds.length === 0) return;
  const leftover = await database.dexie.embeddings.bulkGet(removedIds);
  if (leftover.some((row) => row !== undefined)) {
    throw new StorageReadbackError('invalidateTranscriptionUnitEmbeddings');
  }
}

export async function rereadTranscriptionRegexSplit(input: {
  writtenUnitIds: readonly string[];
  splitUnitIds: readonly string[];
  anchorIds: readonly string[];
}): Promise<{
  units: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
  anchors: AnchorDocType[];
}> {
  const database = await getDb();
  const [unitRows, contents, anchorRows] = await Promise.all([
    database.dexie.layer_units.bulkGet([...input.writtenUnitIds]),
    listUnitTextsByUnits(database, input.splitUnitIds),
    database.dexie.anchors.bulkGet([...input.anchorIds]),
  ]);
  return {
    units: unitRows.filter((row): row is LayerUnitDocType => row !== undefined),
    contents,
    anchors: anchorRows.filter((row): row is AnchorDocType => row !== undefined),
  };
}
