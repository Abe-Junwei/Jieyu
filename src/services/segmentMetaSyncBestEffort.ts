import { createLogger } from '../observability/logger';
import { SegmentMetaService } from './SegmentMetaService';

const log = createLogger('segmentMetaSync');

/**
 * Fire-and-forget segment_meta refresh with observable failures.
 * SegmentMeta is a derived read model; sync must not block primary writes but failures must be logged.
 */
export function scheduleSegmentMetaSyncForUnitIds(
  unitIds: Iterable<string>,
  context: string,
): void {
  void SegmentMetaService.syncForUnitIds(unitIds).catch((error) => {
    log.warn('SegmentMeta sync failed (best-effort)', {
      context,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
