import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { SnapGuide } from '../hooks/useTranscriptionData';

export type ContextMenuUnitKind = 'segment' | 'utterance';

export interface WaveformTimelineItemLike {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string;
}

export interface WaveSurferInstanceLike {
  getCurrentTime: () => number;
  getWrapper: () => HTMLElement;
  getDuration: () => number;
  getDecodedData?: () => AudioBuffer | null;
}

export interface PlayerLike {
  isPlaying: boolean;
  stop: () => void;
  seekTo: (timeSeconds: number) => void;
  instanceRef: MutableRefObject<WaveSurferInstanceLike | null>;
}

export interface ContextMenuStateLike {
  x: number;
  y: number;
  unitId: string;
  layerId: string;
  unitKind: ContextMenuUnitKind;
  splitTime: number;
  source?: 'timeline' | 'waveform';
}

export interface PdfPreviewOpenRequestInput {
  title: string;
  page: number | null;
  sourceUrl?: string;
  sourceBlob?: Blob;
  hashSuffix?: string;
  searchSnippet?: string;
}

export interface SubSelectDragLike {
  active: boolean;
  regionId: string;
  anchorTime: number;
  pointerId: number;
}

export interface UseTranscriptionTimelineInteractionControllerInput {
  layers: LayerDocType[];
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  utterances: UtteranceDocType[];
  selectUnit: (utteranceId: string) => void;
  manualSelectTsRef: MutableRefObject<number>;
  player: PlayerLike;
  locale: string;
  sidePaneRows: LayerDocType[];
  activeTimelineUnitId: string;
  onSetNotePopover: (state: { x: number; y: number; uttId: string; layerId?: string } | null) => void;
  onSetSidebarError: (value: string | null) => void;
  onRevealSchemaLayer: (layerId: string) => void;
  onOpenPdfPreviewRequest: (input: PdfPreviewOpenRequestInput) => void;
  waveformTimelineItems: WaveformTimelineItemLike[];
  runSplitAtTime: (id: string, timeSeconds: number) => void;
  activeLayerIdForEdits: string;
  useSegmentWaveformRegions: boolean;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  selectedTimelineUnit: TimelineUnit | null;
  toggleSegmentSelection: (segmentId: string) => void;
  selectSegmentRange: (anchorId: string, targetId: string, items: WaveformTimelineItemLike[]) => void;
  toggleUnitSelection: (utteranceId: string) => void;
  selectUnitRange: (anchorId: string, targetId: string) => void;
  setSubSelectionRange: (range: { start: number; end: number } | null) => void;
  subSelectDragRef: MutableRefObject<SubSelectDragLike | null>;
  waveCanvasRef: MutableRefObject<HTMLElement | null>;
  zoomToPercent: (percent: number, centerRatio?: number, mode?: 'fit-all' | 'fit-selection' | 'custom') => void;
  zoomToUtterance: (startTime: number, endTime: number) => void;
  resolveSegmentRoutingForLayer: (layerId?: string) => {
    segmentSourceLayer: LayerDocType | undefined;
    sourceLayerId: string;
    editMode: 'utterance' | 'independent-segment' | 'time-subdivision';
  };
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getNeighborBounds: (itemId: string, mediaId: string | undefined, probeStart: number) => { left: number; right: number | undefined };
  reloadSegments: () => Promise<void>;
  saveUtteranceTiming: (id: string, start: number, end: number) => Promise<void>;
  setSaveState: (state: { kind: 'done' | 'error'; message: string }) => void;
  selectedUnitIds: Set<string>;
  selectedWaveformRegionId: string | null;
  beginTimingGesture: (id: string) => void;
  endTimingGesture: (id: string) => void;
  makeSnapGuide: (bounds: { left: number; right: number | undefined }, start: number, end: number) => SnapGuide;
  snapEnabled: boolean;
  setSnapGuide: Dispatch<SetStateAction<SnapGuide>>;
  setDragPreview: Dispatch<SetStateAction<{ id: string; start: number; end: number } | null>>;
  creatingSegmentRef: MutableRefObject<boolean>;
  markingModeRef: MutableRefObject<boolean>;
  setCtxMenu: (state: ContextMenuStateLike | null) => void;
  createUtteranceFromSelection: (start: number, end: number) => Promise<void>;
}

export interface UseTranscriptionTimelineInteractionControllerResult {
  handleSearchReplace: (utteranceId: string, layerId: string | undefined, oldText: string, newText: string) => void;
  handleJumpToEmbeddingMatch: (utteranceId: string) => void;
  handleJumpToCitation: (
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citationRef?: { snippet?: string },
  ) => Promise<void>;
  handleSplitAtTimeRequest: (timeSeconds: number) => boolean;
  handleZoomToSegmentRequest: (segmentId: string, zoomLevel?: number) => boolean;
  getNeighborBoundsRouted: (itemId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => { left: number; right: number | undefined };
  saveTimingRouted: (id: string, start: number, end: number, layerId?: string) => Promise<void>;
  handleWaveformRegionContextMenu: (regionId: string, x: number, y: number) => void;
  handleWaveformRegionAltPointerDown: (regionId: string, time: number, pointerId: number, clientX: number) => void;
  handleWaveformRegionClick: (regionId: string, clickTime: number, event: MouseEvent) => void;
  handleWaveformRegionDoubleClick: (regionId: string, start: number, end: number) => void;
  handleWaveformRegionCreate: (start: number, end: number) => void;
  handleWaveformRegionUpdate: (regionId: string, start: number, end: number) => void;
  handleWaveformRegionUpdateEnd: (regionId: string, start: number, end: number) => void;
  handleWaveformTimeUpdate: (time: number) => void;
}