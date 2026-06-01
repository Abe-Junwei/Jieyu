import { createLogger } from '../observability/logger';
import { SegmentMetaService } from './SegmentMetaService';

const log = createLogger('segmentMetaSync');
const SEGMENT_META_SYNC_BATCH_WINDOW_MS = 50;

let pendingUnitIds = new Set<string>();
let pendingContexts = new Set<string>();
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

function normalizeUnitIds(unitIds: Iterable<string>): string[] {
  return [
    ...new Set(
      Array.from(unitIds)
        .map((unitId) => unitId.trim())
        .filter(Boolean),
    ),
  ];
}

function flushPendingSegmentMetaSync(): void {
  const unitIds = [...pendingUnitIds];
  const contexts = [...pendingContexts];
  pendingUnitIds = new Set<string>();
  pendingContexts = new Set<string>();
  pendingTimer = undefined;

  if (unitIds.length === 0) return;

  void SegmentMetaService.syncForUnitIds(unitIds).catch((error) => {
    log.warn('SegmentMeta sync failed (best-effort)', {
      contexts,
      unitIdCount: unitIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * Fire-and-forget segment_meta refresh with observable failures.
 * SegmentMeta is a derived read model; sync must not block primary writes but failures must be logged.
 */
export function scheduleSegmentMetaSyncForUnitIds(
  unitIds: Iterable<string>,
  context: string,
): void {
  const normalizedUnitIds = normalizeUnitIds(unitIds);
  if (normalizedUnitIds.length === 0) return;

  for (const unitId of normalizedUnitIds) {
    pendingUnitIds.add(unitId);
  }
  pendingContexts.add(context);

  if (pendingTimer) return;
  pendingTimer = setTimeout(flushPendingSegmentMetaSync, SEGMENT_META_SYNC_BATCH_WINDOW_MS);
}
