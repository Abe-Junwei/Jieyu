/**
 * 标注页按轨读 canonical 时的统一入口（与转写页 ADR 0020 对齐）。
 * Re-export hub so AnnotationPage work can import from a stable path without reaching into vertical helpers.
 */
export {
  type LaneScopedUnitView,
  type ResolveCanonicalUnitForTranscriptionLaneResult,
  resolveCanonicalUnitForTranscriptionLaneRow,
  resolvePrimaryUnscopedTranscriptionHostId,
  transcriptionLaneAcceptsUnscopedCanonicalUnits,
} from '../../utils/transcriptionUnitLaneReadScope';

export { pickTimelineUnitsForTranscriptionLayer } from '../../hooks/timelineUnitView';
