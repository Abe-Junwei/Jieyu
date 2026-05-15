import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { LayerActionPanelKind } from '~/hooks/layer/useLayerActionPanel';
import type { PushTimelineEditInput } from '../hooks/ui/useEditEventBuffer';

type SegmentLocalUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

export interface UseReadyWorkspaceTrackEditControllersParams {
  data: ReturnType<typeof import('../hooks/useTranscriptionData').useTranscriptionData>;
  /** 段落读模型 / segment scope — 不在 `useTranscriptionData` 上，勿用 `data.reloadSegments`。 */
  reloadSegments: () => Promise<void>;
  /** `useTranscriptionSegmentBridgeController` */
  refreshSegmentUndoSnapshot: () => Promise<void>;
  /** Segment scope 本地图更新 */
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentLocalUpdater) => void;
  /** `useTranscriptionShellController` */
  layerAction: { setLayerActionPanel: (panel: LayerActionPanelKind) => void };
  /** `useReadyWorkspaceInteractionHelpers` */
  recordTimelineEdit: (event: PushTimelineEditInput) => void;
  timelineUnitViewIndex: any;
  getUnitDocById: any;
  activeTimelineUnitId: any;
  selectedUnitIds: any;
  selectedTimelineUnit: any;
  selectedTimelineMedia: any;
  selectedUnit: any;
  defaultTranscriptionLayerId: any;
  selectedLayerId: any;
  segmentsByLayer: any;
  segmentContentByLayer: any;
  transcriptionTrackMode: any;
  activeTextId: any;
  segmentTimelineLayerIds: any;
  displayStyleControl: any;
  manualSelectTsRef: any;
  player: any;
  navigateUnitFromInput: any;
  waveformAreaRef: any;
  segmentRangeGesturePreviewReadModel: any;
  timelineViewportProjection: any;
  focusedLayerRowId: any;
  zoomToUnit: any;
  startTimelineResizeDrag: any;
  handleNoteClick: any;
  resolveNoteIndicatorTarget: any;
  setOverlapCycleToast: any;
  overlapCycleTelemetryRef: any;
  createLayerWithActiveContext: any;
  handleFocusLayerRow: any;
  tierContainerRef: any;
  zoomPxPerSec: any;
  setCtxMenu: any;
  activeLayerIdForEdits: any;
  setLockConflictToast: any;
  selectUnitRange: any;
  toggleUnitSelection: any;
  selectUnit: any;
  selectSegment: any;
  setSelectedLayerId: any;
  formatTime: any;
  getUnitSpeakerKey: any;
}
