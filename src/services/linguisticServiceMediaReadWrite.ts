import { storagePort } from '../db/storagePort';
import type { MediaItemDocType } from '../db/types';

/** 只读：不再在读取时回填状态字段（2B-C）| Read only: no write-back of state fields on read (2B-C) */
export async function getMediaItemsByTextId(textId: string): Promise<MediaItemDocType[]> {
  return storagePort().listMediaByText(textId);
}

export async function saveMediaItem(data: MediaItemDocType): Promise<string> {
  return storagePort().saveMediaItem(data);
}
