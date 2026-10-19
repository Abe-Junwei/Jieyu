import { getDb } from './engine';
import type { SegmentMetaDocType, TranslationStatusSnapshotDocType } from './types';

function trimmed(id: string): string {
  return id.trim();
}

function layerIdsOf(layerIds: readonly string[]): string[] {
  return [...new Set(layerIds.map((id) => id.trim()).filter((id) => id.length > 0))];
}

export async function countAnchorsByMedia(mediaId: string): Promise<number> {
  const id = trimmed(mediaId);
  if (id.length === 0) return 0;
  const database = await getDb();
  return database.dexie.anchors.where('mediaId').equals(id).count();
}

export async function countUnitTokensByText(textId: string): Promise<number> {
  const id = trimmed(textId);
  if (id.length === 0) return 0;
  const database = await getDb();
  return database.dexie.unit_tokens.where('textId').equals(id).count();
}

export async function listSegmentMetaByText(textId: string): Promise<SegmentMetaDocType[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.segment_meta.where('textId').equals(id).toArray();
}

export async function listSegmentMetaForMediaLayers(
  mediaId: string,
  layerIds: readonly string[],
): Promise<SegmentMetaDocType[]> {
  const id = trimmed(mediaId);
  const layers = layerIdsOf(layerIds);
  if (id.length === 0 || layers.length === 0) return [];
  const database = await getDb();
  return database.dexie.segment_meta
    .where('[layerId+mediaId]')
    .anyOf(layers.map((layerId) => [layerId, id]))
    .toArray();
}

export async function listSegmentMetaForTextLayers(
  textId: string,
  layerIds: readonly string[],
): Promise<SegmentMetaDocType[]> {
  const id = trimmed(textId);
  const layers = layerIdsOf(layerIds);
  if (id.length === 0 || layers.length === 0) return [];
  const database = await getDb();
  return database.dexie.segment_meta
    .where('[textId+layerId]')
    .anyOf(layers.map((layerId) => [id, layerId]))
    .toArray();
}

export async function listTranslationSnapshotsByMedia(
  mediaId: string,
): Promise<TranslationStatusSnapshotDocType[]> {
  const id = trimmed(mediaId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.translation_status_snapshots.where('mediaId').equals(id).toArray();
}

export async function listTranslationSnapshotsByText(
  textId: string,
): Promise<TranslationStatusSnapshotDocType[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.translation_status_snapshots.where('textId').equals(id).toArray();
}
