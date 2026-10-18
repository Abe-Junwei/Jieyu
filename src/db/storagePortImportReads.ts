import { getDb } from './engine';
import type {
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
  SpeakerDocType,
  TextDocType,
  UserNoteDocType,
} from './types';

function trimmed(id: string): string {
  return id.trim();
}

export async function readOpenDatabaseName(): Promise<string> {
  const database = await getDb();
  return database.name;
}

export async function readTextRow(textId: string): Promise<TextDocType | undefined> {
  const id = trimmed(textId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.texts.get(id);
}

export async function readMediaItem(mediaId: string): Promise<MediaItemDocType | undefined> {
  const id = trimmed(mediaId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.media_items.get(id);
}

export async function listMediaItemsByText(textId: string): Promise<MediaItemDocType[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.media_items.where('textId').equals(id).toArray();
}

export async function listLayerUnitsByText(textId: string): Promise<LayerUnitDocType[]> {
  const id = trimmed(textId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.layer_units.where('textId').equals(id).toArray();
}

export async function listLayerUnitContentsByUnitIds(
  unitIds: readonly string[],
): Promise<LayerUnitContentDocType[]> {
  if (unitIds.length === 0) return [];
  const database = await getDb();
  return database.dexie.layer_unit_contents
    .where('unitId')
    .anyOf([...unitIds])
    .toArray();
}

export async function listLayerLinksByLayerIds(
  layerIds: readonly string[],
): Promise<LayerLinkDocType[]> {
  if (layerIds.length === 0) return [];
  const database = await getDb();
  return database.dexie.layer_links
    .where('layerId')
    .anyOf([...layerIds])
    .toArray();
}

export async function listUnitNotes(unitIds: readonly string[]): Promise<UserNoteDocType[]> {
  if (unitIds.length === 0) return [];
  const database = await getDb();
  return database.dexie.user_notes
    .where('[targetType+targetId]')
    .anyOf(unitIds.map((id) => ['unit', id] as [string, string]))
    .toArray();
}

export async function listSpeakersByIds(ids: readonly string[]): Promise<SpeakerDocType[]> {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  const database = await getDb();
  // shortcut(P2-3): 发音人表小，按 id 过滤 | speakers table is small; filter to the requested ids
  const rows = await database.dexie.speakers.toArray();
  return rows.filter((speaker) => wanted.has(speaker.id));
}
