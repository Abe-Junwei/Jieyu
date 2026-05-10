import { getDb, type MediaItemDocType } from '../db';
import { withResolvedMediaItemTimelineKind } from '../utils/mediaItemTimelineKind';

export async function getMediaItemsByTextId(textId: string): Promise<MediaItemDocType[]> {
  const db = await getDb();
  const docs = await db.collections.media_items.findByIndex('textId', textId);
  const rows = docs.map((doc) => doc.toJSON());
  const normalizedRows = rows.map((row) => withResolvedMediaItemTimelineKind(row));
  const changedRows = normalizedRows.filter((row, index) => row !== rows[index]);
  if (changedRows.length > 0) {
    await db.dexie.media_items.bulkPut(changedRows);
  }
  return normalizedRows;
}

export async function saveMediaItem(data: MediaItemDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.media_items.insert(withResolvedMediaItemTimelineKind(data));
  return doc.primary;
}
