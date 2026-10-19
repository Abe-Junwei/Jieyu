import { storagePort } from '../db/storagePort';
import type { NoteTargetType, UserNoteDocType, UserNoteDraft } from '../db/types';
import { dispatchWorkspaceUnitUpdated } from '../utils/workspaceEvents';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';

export async function listNotesByTarget(
  targetType: NoteTargetType,
  targetId: string,
): Promise<UserNoteDocType[]> {
  return storagePort().listNotesByTarget(targetType, targetId);
}

export async function saveUserNote(doc: UserNoteDraft): Promise<string> {
  const stored = await storagePort().putUserNote(doc);
  const parentTargetId = stored.parentTargetId?.trim() ?? '';
  scheduleSegmentMetaSyncForUnitIds(
    [stored.targetId, ...(parentTargetId.length > 0 ? [parentTargetId] : [])],
    'linguisticServiceNoteOps.saveUserNote',
  );
  if (stored.unitId.length > 0) {
    dispatchWorkspaceUnitUpdated({ unitId: stored.unitId });
  }
  return stored.id;
}
