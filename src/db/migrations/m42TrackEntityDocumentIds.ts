import type { Transaction } from 'dexie';
import type { TrackEntityDocType } from '../types';
import { trackEntityDocumentId } from '../trackEntityIds';

/**
 * Remap legacy `track_*` primary keys to `te:${textId}:${trackKey}` so rows are unique per text + track key.
 */
export async function upgradeM42TrackEntityDocumentIds(tx: Transaction): Promise<void> {
  const table = tx.table('track_entities');
  const rows = (await table.toArray()) as TrackEntityDocType[];
  for (const row of rows) {
    const nextId = trackEntityDocumentId(row.textId, row.mediaId);
    if (row.id === nextId) continue;
    await table.delete(row.id);
    await table.put({ ...row, id: nextId });
  }
}
