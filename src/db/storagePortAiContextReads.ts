import { listUnitTextsByUnit } from '../services/LayerSegmentationTextService';
import { getDb } from './engine';
import type { UserNoteDocType } from './types';

export async function listRecentUserNotes(limit: number): Promise<UserNoteDocType[]> {
  const database = await getDb();
  return database.dexie.user_notes.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function readSegmentDetailExpansion(segmentId: string): Promise<{
  unitTexts: Awaited<ReturnType<typeof listUnitTextsByUnit>>;
  notes: UserNoteDocType[];
}> {
  const database = await getDb();
  const [unitTexts, notes] = await Promise.all([
    listUnitTextsByUnit(database, segmentId),
    database.dexie.user_notes.where('[targetType+targetId]').equals(['unit', segmentId]).toArray(),
  ]);
  return { unitTexts, notes };
}
