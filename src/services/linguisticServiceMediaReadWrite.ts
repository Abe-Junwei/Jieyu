import { getDb, type MediaItemDocType } from '../db';

/** 只读：不再在读取时回填状态字段（2B-C）| Read only: no write-back of state fields on read (2B-C) */
export async function getMediaItemsByTextId(textId: string): Promise<MediaItemDocType[]> {
  const db = await getDb();
  const docs = await db.collections.media_items.findByIndex('textId', textId);
  return docs.map((doc) => doc.toJSON());
}

export async function saveMediaItem(data: MediaItemDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.media_items.insert(data);
  return doc.primary;
}
