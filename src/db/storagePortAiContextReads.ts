import { listUnitTextsByUnit } from '../services/LayerSegmentationTextService';
import { getDb } from './engine';
import type { UserNoteDocType } from './types';

/**
 * Newest `user_notes` by `updatedAt`, at most `limit` rows that pass `matches`.
 * `limit` counts matches. Rows that fail `matches` do not consume it, and the
 * walk stops once that many matches are collected or the store ends.
 */
export async function listRecentUserNotes(
  limit: number,
  matches: (note: UserNoteDocType) => boolean,
): Promise<UserNoteDocType[]> {
  const capped = Math.floor(limit);
  if (!Number.isFinite(capped) || capped <= 0) return [];
  const database = await getDb();
  return database.dexie.user_notes
    .orderBy('updatedAt')
    .reverse()
    .filter(matches)
    .limit(capped)
    .toArray();
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
