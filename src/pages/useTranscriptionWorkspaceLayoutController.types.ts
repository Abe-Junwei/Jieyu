import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react';
import type { VideoLayoutMode } from '../components/transcription/TranscriptionTimelineSections';
import type { LayerDocType } from '../types/jieyuDbDocTypes';

export type UseTranscriptionWorkspaceLayoutControllerInput = {
  layers: LayerDocType[];
  selectedTimelineOwnerUnitId: string | undefined;
  unitRowRef: MutableRefObject<Record<string, HTMLDivElement | null>>;
};

export type UseTranscriptionWorkspaceLayoutControllerResult = {
  zoomMode: 'fit-all' | 'fit-selection' | 'custom';
  setZoomMode: Dispatch<SetStateAction<'fit-all' | 'fit-selection' | 'custom'>>;
  isTimelineLaneHeaderCollapsed: boolean;
  toggleTimelineLaneHeader: () => void;
  laneLabelWidth: number;
  timelineLaneHeights: Record<string, number>;
  handleLaneLabelWidthResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleTimelineLaneHeightChange: (layerId: string, nextHeight: number) => void;
  videoPreviewHeight: number;
  videoRightPanelWidth: number;
  videoLayoutMode: VideoLayoutMode;
  setVideoLayoutMode: Dispatch<SetStateAction<VideoLayoutMode>>;
  isResizingVideoPreview: boolean;
  isResizingVideoRightPanel: boolean;
  handleVideoPreviewResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleVideoRightPanelResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  autoScrollEnabled: boolean;
  setAutoScrollEnabled: Dispatch<SetStateAction<boolean>>;
  isFocusMode: boolean;
  exitFocusMode: () => void;
  showShortcuts: boolean;
  closeShortcuts: () => void;
  snapEnabled: boolean;
  setSnapEnabled: Dispatch<SetStateAction<boolean>>;
  toggleSnapEnabled: () => void;
  verticalViewEnabled: boolean;
  setVerticalViewEnabled: Dispatch<SetStateAction<boolean>>;
  toggleVerticalViewEnabled: () => void;
};
