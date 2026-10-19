import { getDb } from './engine';
import { withNoteTextId } from './noteTextId';
import { StorageReadbackError } from './storageReadbackError';
import type {
  NoteCategory,
  NoteTargetType,
  UnitMorphemeDocType,
  UnitTokenDocType,
  UserNoteDocType,
  UserNoteDraft,
} from './types';
import type { MultiLangString } from './types';
import { normalizeUserNoteDocForStorage } from '../utils/camDataUtils';

function trimmed(id: string): string {
  return id.trim();
}

export async function readUnitToken(tokenId: string): Promise<UnitTokenDocType | undefined> {
  const id = trimmed(tokenId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.unit_tokens.get(id);
}

export async function findUnitTokenByIndex(
  unitId: string,
  tokenIndex: number,
): Promise<UnitTokenDocType | undefined> {
  const id = trimmed(unitId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.unit_tokens.where('[unitId+tokenIndex]').equals([id, tokenIndex]).first();
}

export async function readUnitMorpheme(
  morphemeId: string,
): Promise<UnitMorphemeDocType | undefined> {
  const id = trimmed(morphemeId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.unit_morphemes.get(id);
}

export async function findUnitMorphemeByIndex(
  tokenId: string,
  morphemeIndex: number,
): Promise<UnitMorphemeDocType | undefined> {
  const id = trimmed(tokenId);
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.unit_morphemes
    .where('[tokenId+morphemeIndex]')
    .equals([id, morphemeIndex])
    .first();
}

export async function listNotesForTarget(
  targetType: NoteTargetType,
  targetId: string,
): Promise<UserNoteDocType[]> {
  const id = trimmed(targetId);
  if (id.length === 0) return [];
  const database = await getDb();
  return database.dexie.user_notes
    .where('[targetType+targetId]')
    .equals([targetType, id])
    .sortBy('updatedAt');
}

export async function listNotesForTargets(
  targetType: NoteTargetType,
  targetIds: readonly string[],
): Promise<UserNoteDocType[]> {
  if (targetIds.length === 0) return [];
  const database = await getDb();
  return database.dexie.user_notes
    .where('[targetType+targetId]')
    .anyOf(targetIds.map((id) => [targetType, id] as [string, string]))
    .toArray();
}

export async function putUserNoteForTarget(doc: UserNoteDraft): Promise<void> {
  const database = await getDb();
  const stored = normalizeUserNoteDocForStorage(await withNoteTextId(database.dexie, doc));
  await database.dexie.user_notes.put(stored);
  const read = await database.dexie.user_notes.get(stored.id);
  if (!read || read.id !== stored.id || read.textId !== stored.textId) {
    throw new StorageReadbackError('putUserNoteForTarget');
  }
}

export async function updateUserNote(
  id: string,
  updates: { content?: MultiLangString; category?: NoteCategory; updatedAt: string },
): Promise<void> {
  const key = trimmed(id);
  if (key.length === 0) return;
  const database = await getDb();
  const current = await database.dexie.user_notes.get(key);
  if (!current) return;
  const next: UserNoteDocType = { ...current, ...updates, id: key };
  await database.dexie.user_notes.put(next);
  const stored = await database.dexie.user_notes.get(key);
  if (!stored || stored.id !== key || stored.updatedAt !== updates.updatedAt) {
    throw new StorageReadbackError('updateUserNote');
  }
}

export async function deleteUserNote(id: string): Promise<void> {
  const key = trimmed(id);
  if (key.length === 0) return;
  const database = await getDb();
  await database.dexie.user_notes.delete(key);
  const stored = await database.dexie.user_notes.get(key);
  if (stored) throw new StorageReadbackError('deleteUserNote');
}
