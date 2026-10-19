import { getDb } from './engine';
import { listUnitTextsByUnit } from '../services/LayerSegmentationTextService';
import type { LayerUnitContentViewDocType, MediaItemDocType, UserNoteDocType } from './types';

function trimmed(id: string): string {
  return id.trim();
}

export async function readUserNoteById(id: string): Promise<UserNoteDocType | undefined> {
  const key = trimmed(id);
  if (key.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.user_notes.get(key);
}

export async function readMediaItemById(id: string): Promise<MediaItemDocType | undefined> {
  const key = trimmed(id);
  if (key.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.media_items.get(key);
}

export async function listUnitTextsForRag(unitId: string): Promise<LayerUnitContentViewDocType[]> {
  const database = await getDb();
  return listUnitTextsByUnit(database, unitId);
}
