import type { LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';

const EMPTY_UNIT_MAP: ReadonlyMap<string, LayerUnitDocType> = new Map();

/**
 * Unit id used for voice recording persistence (listUnitTextsByUnit) and
 * aligning `useRecording.recordingUnitId` with segment timeline rows.
 */
export function recordingScopeUnitId(
  utt: Pick<TimelineUnitView, 'kind' | 'id' | 'parentUnitId'>,
): string {
  if (utt.kind === 'segment') {
    const p = utt.parentUnitId?.trim();
    if (p) return p;
  }
  return utt.id;
}

/**
 * Resolves the `LayerUnitDocType` passed to `startRecordingForUnit` / voice save.
 * Independent-boundary segments have no `parentUnitId` on the timeline view; they must
 * resolve from the canonical segment graph (`segmentsByLayer`), not `unitById` alone.
 */
export function resolveVoiceRecordingSourceUnit(
  utt: Pick<TimelineUnitView, 'kind' | 'id' | 'parentUnitId'>,
  unitById: ReadonlyMap<string, LayerUnitDocType>,
  segmentById: ReadonlyMap<string, LayerUnitDocType> = EMPTY_UNIT_MAP,
): LayerUnitDocType | undefined {
  if (utt.kind !== 'segment') {
    return unitById.get(utt.id);
  }
  const parent = utt.parentUnitId?.trim();
  if (parent) {
    return unitById.get(parent) ?? segmentById.get(parent);
  }
  return segmentById.get(utt.id);
}
