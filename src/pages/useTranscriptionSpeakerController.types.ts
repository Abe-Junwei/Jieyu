import type { Dispatch, SetStateAction } from 'react';
import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  SpeakerDocType,
} from '../types/jieyuDbDocTypes';
import type { LayerActionPanelKind } from '~/hooks/layer/useLayerActionPanel';
import type { SpeakerFilterOption } from '../hooks/speakerManagement/types';
import type { SaveState, TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/transcription/timelineUnitView';
import type { PushTimelineEditInput } from '../hooks/ui/useEditEventBuffer';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

export interface UseTranscriptionSpeakerControllerInput {
  units: LayerUnitDocType[];
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
  speakers: SpeakerDocType[];
  setSpeakers: Dispatch<SetStateAction<SpeakerDocType[]>>;
  /** Current-media unified rows (same source as timeline / waveform digest). */
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  /** Resolve DB row for unit ids (aligned with unified timeline view). */
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  activeTimelineUnitId: string;
  selectedUnitIds: Set<string>;
  selectedBatchSegmentsForSpeakerActions: LayerUnitDocType[];
  selectedBatchUnits: TimelineUnitView[];
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineMediaId: string | null;
  selectedUnit: LayerUnitDocType | null;
  statePhase: string;
  setUnitSelection: (primaryId: string, ids: string[]) => void;
  data: {
    pushUndo: (label: string) => void;
    undo: () => Promise<void>;
  };
  setSaveState: (state: SaveState) => void;
  getUnitTextForLayer: (unit: LayerUnitDocType) => string | null | undefined;
  formatTime: (seconds: number) => string;
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  resolveSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerUnitDocType>;
  resolveSpeakerActionUnitIds: (ids: Iterable<string>) => string[];
  speakerFilterOptionsForActions: SpeakerFilterOption[];
  segmentSpeakerAssignmentsOnCurrentMedia: Array<{ speakerKey: string }>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUnitIds: Dispatch<SetStateAction<Set<string>>>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  layerAction: {
    setLayerActionPanel: (panel: LayerActionPanelKind) => void;
  };
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
}
