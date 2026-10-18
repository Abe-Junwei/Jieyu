import { getDb } from './engine';
import { withNoteTextId } from './noteTextId';
import { StorageReadbackError } from './storageReadbackError';
import type { NoteTargetType, UserNoteDocType, UserNoteDraft } from './types';
import { normalizeUserNoteDocForStorage } from '../utils/camDataUtils';

export async function listNotesByTarget(
  targetType: NoteTargetType,
  targetId: string,
): Promise<UserNoteDocType[]> {
  const database = await getDb();
  return database.dexie.user_notes
    .where('[targetType+targetId]')
    .equals([targetType, targetId])
    .sortBy('updatedAt');
}

async function unitIdForNote(
  database: Awaited<ReturnType<typeof getDb>>,
  stored: UserNoteDocType,
): Promise<string> {
  if (stored.targetType === 'unit') return stored.targetId.trim();
  if (stored.targetType === 'token') {
    const token = await database.dexie.unit_tokens.get(stored.targetId);
    const fromToken = token?.unitId.trim() ?? '';
    if (fromToken.length > 0) return fromToken;
    return stored.parentTargetId?.trim() ?? '';
  }
  if (stored.targetType === 'morpheme') {
    const morpheme = await database.dexie.unit_morphemes.get(stored.targetId);
    return morpheme?.unitId.trim() ?? '';
  }
  return '';
}

export async function putUserNote(
  doc: UserNoteDraft,
): Promise<{ id: string; targetId: string; parentTargetId?: string; unitId: string }> {
  const database = await getDb();
  const stored = normalizeUserNoteDocForStorage(await withNoteTextId(database.dexie, doc));
  await database.dexie.user_notes.put(stored);
  const read = await database.dexie.user_notes.get(stored.id);
  if (!read || read.id !== stored.id || read.textId !== stored.textId) {
    throw new StorageReadbackError('putUserNote');
  }
  const parentTargetId = stored.parentTargetId?.trim() ?? '';
  return {
    id: stored.id,
    targetId: stored.targetId,
    ...(parentTargetId.length > 0 ? { parentTargetId } : {}),
    unitId: await unitIdForNote(database, stored),
  };
}
