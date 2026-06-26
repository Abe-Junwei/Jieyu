import type { LayerUnitDocType, MediaItemDocType } from '../db';
import {
  isAuxiliaryRecordingMediaRow,
  isMediaItemPlaceholderRow,
  MEDIA_TIMELINE_KIND_ACOUSTIC,
  resolveMediaItemTimelineKind,
} from './mediaItemTimelineKind';
import { maxUnitEndTimeSec } from './timelineAxisStatus';

function readPositiveLogical(metadata: Record<string, unknown> | undefined): number {
  const raw = metadata?.logicalDurationSec;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function resolveEstablishedAcousticDurationSec(
  mediaRows: ReadonlyArray<MediaItemDocType>,
): number {
  let maxDur = 0;
  for (const row of mediaRows) {
    if (isAuxiliaryRecordingMediaRow(row) || isMediaItemPlaceholderRow(row)) continue;
    if (resolveMediaItemTimelineKind(row) !== MEDIA_TIMELINE_KIND_ACOUSTIC) continue;
    const d = row.duration;
    if (typeof d === 'number' && Number.isFinite(d) && d > maxDur) {
      maxDur = d;
    }
  }
  return maxDur;
}

export function resolveEstablishedDocumentSpanSec(
  metadata: Record<string, unknown> | undefined,
  units: ReadonlyArray<Pick<LayerUnitDocType, 'endTime'>>,
): number {
  const logical = readPositiveLogical(metadata);
  const maxEnd = maxUnitEndTimeSec(units);
  return Math.max(logical, maxEnd);
}

export function resolveImportedUnitsMaxEndSec(units: ReadonlyArray<{ endTime?: number }>): number {
  return maxUnitEndTimeSec(units);
}
