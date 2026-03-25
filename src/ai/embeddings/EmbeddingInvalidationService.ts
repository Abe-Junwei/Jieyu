import type { JieyuDatabase, LayerDocType, UtteranceDocType } from '../../db';

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
  previous: Pick<UtteranceDocType, 'transcription'> | null | undefined,
  next: Pick<UtteranceDocType, 'transcription'>,
): boolean {
  return normalizeEmbeddedDefaultText(previous?.transcription?.default)
    !== normalizeEmbeddedDefaultText(next.transcription?.default);
}

export async function invalidateUtteranceEmbeddings(
  db: JieyuDatabase,
  utteranceIds: Iterable<string>,
): Promise<string[]> {
  const normalizedIds = [...new Set(Array.from(utteranceIds)
    .map((id) => id.trim())
    .filter((id) => id.length > 0))];

  if (normalizedIds.length === 0) return [];

  const rows = await db.dexie.embeddings.where('sourceId').anyOf(normalizedIds).toArray();
  const embeddingIds = rows
    .filter((row) => row.sourceType === 'utterance')
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

export async function isDefaultTranscriptionLayerForUtteranceText(
  db: JieyuDatabase,
  utteranceId: string,
  layerId: string | undefined,
): Promise<boolean> {
  if (!layerId) return false;

  const utterance = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
  const textId = utterance?.toJSON().textId;
  if (!textId) return false;

  const defaultLayerId = await resolveDefaultTranscriptionLayerIdForText(db, textId);
  return defaultLayerId === layerId;
}