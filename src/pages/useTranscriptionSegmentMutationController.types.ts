import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { SaveState, TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/transcription/timelineUnitView';
import type { PushTimelineEditInput } from '../hooks/ui/useEditEventBuffer';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import type { AiSegmentSplitRollbackToken } from '../hooks/ai/useAiToolCallHandler.types';

export interface UseTranscriptionSegmentMutationControllerInput {
  activeLayerIdForEdits: string;
  resolveSegmentRoutingForLayer: (layerId?: string) => SegmentRoutingResult;
  pushUndo: (label: string) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  findUnitDocContainingRange: (start: number, end: number) => LayerUnitDocType | undefined;
  setSaveState: (state: SaveState) => void;
  splitUnit: (id: string, splitTime: number) => Promise<void>;
  mergeSelectedUnits: (ids: Set<string>) => Promise<void>;
  mergeWithPrevious: (id: string) => Promise<void>;
  mergeWithNext: (id: string) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  deleteSelectedUnits: (ids: Set<string>) => Promise<void>;
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
}

export interface UseTranscriptionSegmentMutationControllerResult {
  splitRouted: (
    id: string,
    splitTime: number,
    layerIdOverride?: string,
  ) => Promise<AiSegmentSplitRollbackToken | undefined>;
  mergeAdjacentSegmentsForAiRollback: (keepId: string, removeId: string) => Promise<void>;
  mergeWithPreviousRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeWithNextRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeSelectedSegmentsRouted: (ids: Set<string>, layerIdOverride?: string) => Promise<void>;
  deleteUnitRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  deleteSelectedUnitsRouted: (ids: Set<string>, layerIdOverride?: string) => Promise<void>;
  toggleSkipProcessingRouted: (id: string, layerIdOverride?: string) => Promise<void>;
}
