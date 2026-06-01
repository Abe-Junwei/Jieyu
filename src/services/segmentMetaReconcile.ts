import { createLogger } from '../observability/logger';
import { SegmentMetaService } from './SegmentMetaService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';

const log = createLogger('segmentMetaReconcile');

export interface SegmentMetaDriftReport {
  layerId: string;
  mediaId: string;
  expectedCount: number;
  storedCount: number;
  drifted: boolean;
}

async function countExpectedSegmentRows(layerId: string, mediaId: string): Promise<number> {
  const unitRows = await LayerSegmentQueryService.listUnitsByLayerMedia(layerId, mediaId);
  return unitRows.filter((row) => row.unitType === 'segment' || row.unitType === 'unit').length;
}

async function countStoredSegmentMetaRows(layerId: string, mediaId: string): Promise<number> {
  const rows = await SegmentMetaService.listByLayerMedia(layerId, mediaId);
  return rows.length;
}

/** Compare derived segment_meta row count vs primary layer_units for a scope. */
export async function detectSegmentMetaDrift(
  layerId: string,
  mediaId: string,
): Promise<SegmentMetaDriftReport | null> {
  const normalizedLayerId = layerId.trim();
  const normalizedMediaId = mediaId.trim();
  if (!normalizedLayerId || !normalizedMediaId) return null;

  const [expectedCount, storedCount] = await Promise.all([
    countExpectedSegmentRows(normalizedLayerId, normalizedMediaId),
    countStoredSegmentMetaRows(normalizedLayerId, normalizedMediaId),
  ]);

  return {
    layerId: normalizedLayerId,
    mediaId: normalizedMediaId,
    expectedCount,
    storedCount,
    drifted: expectedCount !== storedCount,
  };
}

/**
 * Read-path reconcile: rebuild segment_meta when drift is detected.
 * Returns fresh rows after optional rebuild.
 */
export async function ensureSegmentMetaFreshForLayerMedia(
  layerId: string,
  mediaId: string,
  context: string,
): Promise<void> {
  const report = await detectSegmentMetaDrift(layerId, mediaId);
  if (!report || !report.drifted) return;

  log.warn('SegmentMeta drift detected; rebuilding derived table', {
    context,
    layerId: report.layerId,
    mediaId: report.mediaId,
    expectedCount: report.expectedCount,
    storedCount: report.storedCount,
  });
  await SegmentMetaService.rebuildForLayerMedia(report.layerId, report.mediaId);
}
