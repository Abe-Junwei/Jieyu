import { getDb } from './engine';
import type {
  AnchorDocType,
  LayerDocType,
  LayerLinkDocType,
  LayerUnitDocType,
  MediaItemDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from './types';
import { readAnnotationDocumentScope } from '../services/annotationDocumentService';
import { listUnitDocsForText } from '../services/LayerSegmentGraphService';

export async function readTranscriptionDatabaseName(): Promise<string> {
  const database = await getDb();
  return database.name;
}

export async function readTranscriptionLayersByTextId(textId: string): Promise<LayerDocType[]> {
  const id = textId.trim();
  if (id.length === 0) return [];
  const database = await getDb();
  const docs = await database.collections.layers.findByIndex('textId', id);
  return docs.map((doc) => doc.toJSON() as LayerDocType);
}

export async function readTranscriptionMediaByTextId(textId: string): Promise<MediaItemDocType[]> {
  const id = textId.trim();
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.media_items.where('textId').equals(id).toArray();
}

export async function readTranscriptionDocumentScope(textId: string) {
  const database = await getDb();
  return readAnnotationDocumentScope(database, textId);
}

export async function readTranscriptionUnitsForText(
  textId: string,
  excludeLayerIds: ReadonlySet<string>,
): Promise<LayerUnitDocType[]> {
  const database = await getDb();
  return listUnitDocsForText(database, textId, excludeLayerIds);
}

export async function readTranscriptionAnchorsByMediaIds(
  mediaIds: readonly string[],
): Promise<AnchorDocType[]> {
  if (mediaIds.length === 0) return [];
  const database = await getDb();
  return database.dexie.anchors
    .where('mediaId')
    .anyOf([...mediaIds])
    .toArray();
}

export async function readTranscriptionLayerLinksForLayerIds(layerIds: readonly string[]): Promise<{
  byLayer: LayerLinkDocType[];
  byHost: LayerLinkDocType[];
}> {
  if (layerIds.length === 0) return { byLayer: [], byHost: [] };
  const database = await getDb();
  const [byLayer, byHost] = await Promise.all([
    database.dexie.layer_links
      .where('layerId')
      .anyOf([...layerIds])
      .toArray(),
    database.dexie.layer_links
      .where('hostTranscriptionLayerId')
      .anyOf([...layerIds])
      .toArray(),
  ]);
  return { byLayer, byHost };
}

export async function readTranscriptionTokensByTextId(textId: string): Promise<UnitTokenDocType[]> {
  const id = textId.trim();
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.unit_tokens.where('textId').equals(id).toArray();
}

export async function readTranscriptionMorphemesByTextId(
  textId: string,
): Promise<UnitMorphemeDocType[]> {
  const id = textId.trim();
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.unit_morphemes.where('textId').equals(id).toArray();
}
