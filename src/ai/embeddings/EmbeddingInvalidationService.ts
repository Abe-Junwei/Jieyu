import type { JieyuDatabase, LayerDocType, LayerUnitDocType } from '../../db';
import { getUnitDocProjectionById } from '../../services/LayerSegmentGraphService';

function normalizeEmbeddedDefaultText(text: string | null | undefined): string {
  return (text ?? '').trim();
}

function sortLayersByDefaultPriority(layers: LayerDocType[]): LayerDocType[] {
  return [...layers].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

export function hasEmbeddedDefaultTextChanged(
  previous: Pick<LayerUnitDocType, 'transcription'> | null | undefined,
  next: Pick<LayerUnitDocType, 'transcription'>,
): boolean {
  return normalizeEmbeddedDefaultText(previous?.transcription?.default)
    !== normalizeEmbeddedDefaultText(next.transcription?.default);
}

export async function invalidateUnitEmbeddings(
  db: JieyuDatabase,
  unitIds: Iterable<string>,
): Promise<string[]> {
  const normalizedIds = [...new Set(Array.from(unitIds)
    .map((id) => id.trim())
    .filter((id) => id.length > 0))];

  if (normalizedIds.length === 0) return [];

  const rows = await db.dexie.embeddings.where('sourceId').anyOf(normalizedIds).toArray();
  const embeddingIds = rows
    .filter((row) => row.sourceType === 'unit')
    .map((row) => row.id);

  if (embeddingIds.length > 0) {
    await db.dexie.embeddings.bulkDelete(embeddingIds);
  }

  return embeddingIds;
}

export async function invalidateNoteEmbeddings(
  db: JieyuDatabase,
  noteIds: Iterable<string>,
): Promise<string[]> {
  const normalizedIds = [...new Set(Array.from(noteIds)
    .map((id) => id.trim())
    .filter((id) => id.length > 0))];

  if (normalizedIds.length === 0) return [];

  const rows = await db.dexie.embeddings.where('sourceId').anyOf(normalizedIds).toArray();
  const embeddingIds = rows
    .filter((row) => row.sourceType === 'note')
    .map((row) => row.id);

  if (embeddingIds.length > 0) {
    await db.dexie.embeddings.bulkDelete(embeddingIds);
  }

  return embeddingIds;
}

export async function invalidatePdfEmbeddings(
  db: JieyuDatabase,
  pdfIds: Iterable<string>,
): Promise<string[]> {
  const normalizedIds = [...new Set(Array.from(pdfIds)
    .map((id) => id.trim())
    .filter((id) => id.length > 0))];

  if (normalizedIds.length === 0) return [];

  const rows = await db.dexie.embeddings.where('sourceId').anyOf(normalizedIds).toArray();
  const embeddingIds = rows
    .filter((row) => row.sourceType === 'pdf')
    .map((row) => row.id);

  if (embeddingIds.length > 0) {
    await db.dexie.embeddings.bulkDelete(embeddingIds);
  }

  return embeddingIds;
}

export async function resolveDefaultTranscriptionLayerIdForText(
  db: JieyuDatabase,
  textId: string,
): Promise<string | undefined> {
  const layers = (await db.collections.layers.findByIndex('textId', textId))
    .map((doc) => doc.toJSON())
    .filter((layer) => layer.layerType === 'transcription');

  if (layers.length === 0) return undefined;

  const explicitDefault = layers.find((layer) => layer.isDefault === true);
  if (explicitDefault) return explicitDefault.id;

  return sortLayersByDefaultPriority(layers)[0]?.id;
}

export async function isDefaultTranscriptionLayerForUnitText(
  db: JieyuDatabase,
  unitId: string,
  layerId: string | undefined,
): Promise<boolean> {
  if (!layerId) return false;

  const unit = await getUnitDocProjectionById(db, unitId);
  const textId = unit?.textId;
  if (!textId) return false;

  const defaultLayerId = await resolveDefaultTranscriptionLayerIdForText(db, textId);
  return defaultLayerId === layerId;
}