import { getDb, type NoteTargetType, type UserNoteDocType } from '../db';
import { normalizeUserNoteDocForStorage } from '../utils/camDataUtils';
import { dispatchWorkspaceUnitUpdated } from '../utils/workspaceEvents';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';

type JieyuDb = Awaited<ReturnType<typeof getDb>>;

async function resolveUnitIdForNote(db: JieyuDb, stored: UserNoteDocType): Promise<string> {
  if (stored.targetType === 'unit') return stored.targetId.trim();
  if (stored.targetType === 'token') {
    const tok = await db.dexie.unit_tokens.get(stored.targetId);
    const fromToken = tok?.unitId.trim() ?? '';
    if (fromToken.length > 0) return fromToken;
    return stored.parentTargetId?.trim() ?? '';
  }
  if (stored.targetType === 'morpheme') {
    const mor = await db.dexie.unit_morphemes.get(stored.targetId);
    return mor?.unitId.trim() ?? '';
  }
  return '';
}

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
  const unitId = await resolveUnitIdForNote(db, stored);
  if (unitId.length > 0) {
    dispatchWorkspaceUnitUpdated({ unitId });
  }
  return stored.id;
}
