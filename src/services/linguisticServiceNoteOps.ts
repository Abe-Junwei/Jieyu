import { getDb, type NoteTargetType, type UserNoteDocType } from '../db';
import { normalizeUserNoteDocForStorage } from '../utils/camDataUtils';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';

export async function listNotesByTarget(
  targetType: NoteTargetType,
  targetId: string,
): Promise<UserNoteDocType[]> {
  const db = await getDb();
  return db.dexie.user_notes
    .where('[targetType+targetId]')
    .equals([targetType, targetId])
    .sortBy('updatedAt');
}

export async function saveUserNote(doc: UserNoteDocType): Promise<string> {
  const db = await getDb();
  const stored = normalizeUserNoteDocForStorage(doc);
  await db.dexie.user_notes.put(stored);
  scheduleSegmentMetaSyncForUnitIds(
    [stored.targetId, ...(stored.parentTargetId ? [stored.parentTargetId] : [])],
    'linguisticServiceNoteOps.saveUserNote',
  );
  return stored.id;
}
