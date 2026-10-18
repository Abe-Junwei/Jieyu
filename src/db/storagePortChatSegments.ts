import { getDb } from './engine';
import {
  captureAiCanonicalClusterRollbackSnapshot,
  restoreAiCanonicalClusterRollbackSnapshot,
  type AiCanonicalClusterRollbackSnapshot,
} from '../services/AiCanonicalClusterRollbackSnapshot';
import {
  reinsertLayerSegmentGraphSubset,
  snapshotLayerSegmentGraphBySegmentIds,
  type LayerSegmentGraphSnapshot,
} from './storagePortServiceLayerSegmentGraph';

export async function readSegmentLayerStoredText(
  segmentId: string,
  layerId: string,
): Promise<string> {
  const segment = segmentId.trim();
  const layer = layerId.trim();
  if (segment.length === 0 || layer.length === 0) return '';
  const database = await getDb();
  const rows = await database.dexie.layer_unit_contents.where('unitId').equals(segment).toArray();
  return rows.find((row) => row.layerId === layer)?.text?.trim() ?? '';
}

export async function snapshotSegmentGraphForRollback(
  segmentIds: readonly string[],
): Promise<LayerSegmentGraphSnapshot> {
  const database = await getDb();
  return snapshotLayerSegmentGraphBySegmentIds(database, segmentIds);
}

export async function reinsertSegmentGraphForRollback(
  snapshot: LayerSegmentGraphSnapshot,
): Promise<void> {
  const database = await getDb();
  await reinsertLayerSegmentGraphSubset(database, snapshot);
}

export async function captureCanonicalClusterRollback(
  canonicalIds: readonly string[],
): Promise<AiCanonicalClusterRollbackSnapshot | null> {
  const database = await getDb();
  return captureAiCanonicalClusterRollbackSnapshot(database, canonicalIds);
}

export async function restoreCanonicalClusterRollback(
  snapshot: AiCanonicalClusterRollbackSnapshot,
): Promise<void> {
  const database = await getDb();
  await restoreAiCanonicalClusterRollbackSnapshot(database, snapshot);
}
