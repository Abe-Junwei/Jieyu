import type {
  LayerDocType,
  LayerSegmentViewDocType,
  LayerUnitDocType,
  SpeakerDocType,
} from '../types/jieyuDbDocTypes';
import type { TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/transcription/timelineUnitView';

export type SpeakerAssignmentLike = {
  unitId: string;
  speakerKey: string;
};

export interface UseSpeakerActionScopeControllerInput {
  /** Unified current-media rows (same ordering as timeline digest). */
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentViewDocType[]>;
  speakers: SpeakerDocType[];
  layers: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  selectedLayerId?: string | null;
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null;
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
}

export interface UseSpeakerActionScopeControllerResult {
  segmentByIdForSpeakerActions: Map<string, LayerSegmentViewDocType>;
  resolveSpeakerKeyForSegment: (segment: LayerSegmentViewDocType) => string;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerSegmentViewDocType) => string;
  segmentSpeakerAssignmentsOnCurrentMedia: SpeakerAssignmentLike[];
  speakerVisualByTimelineUnitId: Record<string, { name: string; color: string }>;
  activeSpeakerManagementLayer: LayerDocType | null;
  speakerFilterOptionsForActions: Array<{
    key: string;
    name: string;
    count: number;
    color?: string;
  }>;
  selectedUnitIdsForSpeakerActions: string[];
  selectedSegmentIdsForSpeakerActions: string[];
  selectedBatchSegmentsForSpeakerActions: LayerSegmentViewDocType[];
  selectedBatchUnits: TimelineUnitView[];
  resolveSpeakerActionUnitIds: (ids: Iterable<string>) => string[];
  selectedSpeakerUnitIdsForActionsSet: Set<string>;
}
