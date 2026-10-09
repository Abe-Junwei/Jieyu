import { createLogger } from '../observability/logger';
import { SegmentMetaService } from './SegmentMetaService';

const log = createLogger('segmentMetaSync');
const SEGMENT_META_SYNC_BATCH_WINDOW_MS = 50;

let pendingUnitIds = new Set<string>();
let pendingContexts = new Set<string>();
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
const inFlightSyncs = new Set<Promise<void>>();

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

  const sync: Promise<void> = SegmentMetaService.syncForUnitIds(unitIds)
    .then(() => undefined)
    .catch((error) => {
      log.warn('SegmentMeta sync failed (best-effort)', {
        contexts,
        unitIdCount: unitIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      inFlightSyncs.delete(sync);
    });
  inFlightSyncs.add(sync);
}

/**
 * 立即冲刷待同步的 unit 并等待所有进行中的同步结束（测试与需要读一致 segment_meta 的调用方使用）。
 * Flush pending unit ids now and wait until every in-flight sync has settled (for tests and callers
 * that need a consistent segment_meta read).
 */
export async function settleSegmentMetaSync(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    flushPendingSegmentMetaSync();
  }
  while (inFlightSyncs.size > 0) {
    await Promise.all([...inFlightSyncs]);
  }
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
