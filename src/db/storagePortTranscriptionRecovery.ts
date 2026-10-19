import { getDb } from './engine';
import { importDatabaseFromJson } from './io';
import type { LayerUnitDocType } from './types';
import { listUnitDocsByIds } from '../services/LayerSegmentGraphService';

export async function readTranscriptionUnitsByIds(
  ids: readonly string[],
): Promise<LayerUnitDocType[]> {
  const database = await getDb();
  return listUnitDocsByIds(database, ids);
}

export async function importTranscriptionRecoverySnapshot(snapshot: unknown): Promise<void> {
  await importDatabaseFromJson(snapshot, { strategy: 'upsert' });
}
