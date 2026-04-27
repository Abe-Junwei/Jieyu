import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import type { VideoLayoutMode } from '../components/transcription/TranscriptionTimelineSections';
import type { LayerDocType } from '../types/jieyuDbDocTypes';
import { DEFAULT_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import { createLogger } from '../observability/logger';
import {
  readStoredClampedNumber,
  readStoredBoolean,
  readStoredLaneHeights,
  readStoredVerticalViewEnabled,
  readStoredWorkspaceZoomMode,
  resetDocumentResizeStyles,
  WORKSPACE_AUTO_SCROLL_KEY,
  WORKSPACE_DEFAULT_ZOOM_MODE_KEY,
  WORKSPACE_SNAP_KEY,
} from './transcriptionWorkspaceLayoutControllerPrefs';
import {
  readStoredVideoLayoutModePreference,
  readStoredVideoPreviewHeightPreference,
  readStoredVideoRightPanelWidthPreference,
  subscribeWorkspaceLayoutPreferenceChanged,
  WORKSPACE_VERTICAL_VIEW_STORAGE_KEY,
} from '../utils/workspaceLayoutPreferenceSync';

const log = createLogger('TranscriptionWorkspaceLayout');
type UseTranscriptionWorkspaceLayoutControllerInput = {
  layers: LayerDocType[];
  selectedTimelineOwnerUnitId: string | undefined;
  unitRowRef: MutableRefObject<Record<string, HTMLDivElement | null>>;
};

type UseTranscriptionWorkspaceLayoutControllerResult = {
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

export function useTranscriptionWorkspaceLayoutController(
  input: UseTranscriptionWorkspaceLayoutControllerInput,
): UseTranscriptionWorkspaceLayoutControllerResult {
  const [zoomMode, setZoomMode] = useState<'fit-all' | 'fit-selection' | 'custom'>(() => readStoredWorkspaceZoomMode());
  const [isTimelineLaneHeaderCollapsed, setIsTimelineLaneHeaderCollapsed] = useState(false);
  const [laneLabelWidth, setLaneLabelWidth] = useState<number>(() => readStoredClampedNumber('jieyu:lane-label-width', 40, 180, 64));
  const laneLabelWidthRef = useRef<number>(laneLabelWidth);
  const [timelineLaneHeights, setTimelineLaneHeights] = useState<Record<string, number>>(() => readStoredLaneHeights());
  const [videoPreviewHeight, setVideoPreviewHeight] = useState<number>(readStoredVideoPreviewHeightPreference);
  const videoPreviewResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [isResizingVideoPreview, setIsResizingVideoPreview] = useState(false);
  const [videoRightPanelWidth, setVideoRightPanelWidth] = useState<number>(readStoredVideoRightPanelWidthPreference);
  const videoRightPanelResizeRef = useRef<{ startX: number; startWidth: number; factor: number } | null>(null);
  const [isResizingVideoRightPanel, setIsResizingVideoRightPanel] = useState(false);
  const [videoLayoutMode, setVideoLayoutMode] = useState<VideoLayoutMode>(readStoredVideoLayoutModePreference);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(() => readStoredBoolean(WORKSPACE_AUTO_SCROLL_KEY, true));
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(() => readStoredBoolean(WORKSPACE_SNAP_KEY, false));
  const [verticalViewEnabled, setVerticalViewEnabled] = useState<boolean>(() => readStoredVerticalViewEnabled());

  useEffect(() => {
    laneLabelWidthRef.current = laneLabelWidth;
  }, [laneLabelWidth]);

  useEffect(() => subscribeWorkspaceLayoutPreferenceChanged(() => {
    setVideoPreviewHeight((prev) => {
      const next = readStoredVideoPreviewHeightPreference();
      return prev === next ? prev : next;
    });
    setVideoRightPanelWidth((prev) => {
      const next = readStoredVideoRightPanelWidthPreference();
      return prev === next ? prev : next;
    });
    setVideoLayoutMode((prev) => {
      const next = readStoredVideoLayoutModePreference();
      return prev === next ? prev : next;
    });
    setZoomMode((prev) => {
      const next = readStoredWorkspaceZoomMode();
      return prev === next ? prev : next;
    });
    setAutoScrollEnabled((prev) => {
      const next = readStoredBoolean(WORKSPACE_AUTO_SCROLL_KEY, true);
      return prev === next ? prev : next;
    });
    setSnapEnabled((prev) => {
      const next = readStoredBoolean(WORKSPACE_SNAP_KEY, false);
      return prev === next ? prev : next;
    });
    setVerticalViewEnabled((prev) => {
      const next = readStoredVerticalViewEnabled();
      return prev === next ? prev : next;
    });
  }), []);

  const toggleTimelineLaneHeader = useCallback(() => {
    setIsTimelineLaneHeaderCollapsed((prev) => !prev);
  }, []);

  const handleLaneLabelWidthResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isTimelineLaneHeaderCollapsed) return;

    const startX = event.clientX;
    const startWidth = laneLabelWidth;

    // 拖拽期间禁用 lane-label 相关 transition，避免上下区域动画不同步 | Disable lane-label transitions during drag to keep waveform and timeline in sync
    document.documentElement.classList.add('lane-label-resizing');

    const onMove = (nextEvent: PointerEvent) => {
      const next = Math.max(40, Math.min(180, startWidth + (nextEvent.clientX - startX)));
      laneLabelWidthRef.current = next;
      setLaneLabelWidth(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.documentElement.classList.remove('lane-label-resizing');
      try {
        localStorage.setItem('jieyu:lane-label-width', String(laneLabelWidthRef.current));
      } catch (error) {
        log.warn('Failed to persist lane label width to localStorage', {
          storageKey: 'jieyu:lane-label-width',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [isTimelineLaneHeaderCollapsed, laneLabelWidth]);

  useEffect(() => {
    if (!autoScrollEnabled) return;
    if (!input.selectedTimelineOwnerUnitId) return;
    const row = input.unitRowRef.current[input.selectedTimelineOwnerUnitId];
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [autoScrollEnabled, input.selectedTimelineOwnerUnitId, input.unitRowRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.metaKey || event.ctrlKey;
      if (hasMod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setIsFocusMode((prev) => !prev);
        return;
      }

      if (event.key === 'Escape') {
        setIsFocusMode((prev) => {
          if (prev) {
            event.preventDefault();
            return false;
          }
          return prev;
        });
      }

      if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
        const target = event.target as HTMLElement | null;
        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)) {
          event.preventDefault();
          setShowShortcuts((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const layerIds = new Set(input.layers.map((layer) => layer.id));
    setTimelineLaneHeights((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([layerId]) => layerIds.has(layerId)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [input.layers]);

  const handleTimelineLaneHeightChange = useCallback((layerId: string, nextHeight: number) => {
    setTimelineLaneHeights((prev) => {
      if (nextHeight === DEFAULT_TIMELINE_LANE_HEIGHT) {
        if (!(layerId in prev)) return prev;
        const next = { ...prev };
        delete next[layerId];
        return next;
      }
      if (prev[layerId] === nextHeight) return prev;
      return { ...prev, [layerId]: nextHeight };
    });
  }, []);

  const toggleVerticalViewEnabled = useCallback(() => {
    setVerticalViewEnabled((prev) => !prev);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:lane-heights', JSON.stringify(timelineLaneHeights));
    } catch (error) {
      log.warn('Failed to persist lane heights to localStorage', {
        storageKey: 'jieyu:lane-heights',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [timelineLaneHeights]);

  const handleVideoPreviewResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    videoPreviewResizeRef.current = { startY: event.clientY, startHeight: videoPreviewHeight };
    setIsResizingVideoPreview(true);
  }, [videoPreviewHeight]);

  useEffect(() => {
    if (!isResizingVideoPreview) return;

    const handleMove = (event: PointerEvent): void => {
      const drag = videoPreviewResizeRef.current;
      if (!drag) return;
      const next = Math.min(Math.max(Math.round(drag.startHeight + event.clientY - drag.startY), 120), 600);
      setVideoPreviewHeight(next);
    };

    const stop = (): void => {
      videoPreviewResizeRef.current = null;
      setIsResizingVideoPreview(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      resetDocumentResizeStyles();
    };
  }, [isResizingVideoPreview]);

  const handleVideoRightPanelResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    videoRightPanelResizeRef.current = {
      startX: event.clientX,
      startWidth: videoRightPanelWidth,
      factor: videoLayoutMode === 'left' ? -1 : 1,
    };
    setIsResizingVideoRightPanel(true);
  }, [videoLayoutMode, videoRightPanelWidth]);

  useEffect(() => {
    if (!isResizingVideoRightPanel) return;

    const handleMove = (event: PointerEvent): void => {
      const drag = videoRightPanelResizeRef.current;
      if (!drag) return;
      const next = Math.min(Math.max(Math.round(drag.startWidth + drag.factor * (drag.startX - event.clientX)), 260), 720);
      setVideoRightPanelWidth(next);
    };

    const stop = (): void => {
      videoRightPanelResizeRef.current = null;
      setIsResizingVideoRightPanel(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      resetDocumentResizeStyles();
    };
  }, [isResizingVideoRightPanel]);

  useEffect(() => () => {
    videoPreviewResizeRef.current = null;
    videoRightPanelResizeRef.current = null;
    resetDocumentResizeStyles();
  }, []);

  useEffect(() => {
    if (videoLayoutMode === 'right' || videoLayoutMode === 'left') return;
    videoRightPanelResizeRef.current = null;
    setIsResizingVideoRightPanel(false);
  }, [videoLayoutMode]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-preview-height', String(videoPreviewHeight));
      localStorage.setItem('jieyu:video-layout-mode', videoLayoutMode);
      localStorage.setItem('jieyu:video-right-panel-width', String(videoRightPanelWidth));
      localStorage.setItem(WORKSPACE_DEFAULT_ZOOM_MODE_KEY, zoomMode);
      localStorage.setItem(WORKSPACE_AUTO_SCROLL_KEY, autoScrollEnabled ? '1' : '0');
      localStorage.setItem(WORKSPACE_SNAP_KEY, snapEnabled ? '1' : '0');
      localStorage.setItem(WORKSPACE_VERTICAL_VIEW_STORAGE_KEY, verticalViewEnabled ? '1' : '0');
    } catch (error) {
      log.warn('Failed to persist workspace layout preferences to localStorage', {
        storageKeys: [
          'jieyu:video-preview-height',
          'jieyu:video-layout-mode',
          'jieyu:video-right-panel-width',
          WORKSPACE_DEFAULT_ZOOM_MODE_KEY,
          WORKSPACE_AUTO_SCROLL_KEY,
          WORKSPACE_SNAP_KEY,
          WORKSPACE_VERTICAL_VIEW_STORAGE_KEY,
        ],
        values: {
          videoPreviewHeight,
          videoLayoutMode,
          videoRightPanelWidth,
          zoomMode,
          autoScrollEnabled,
          snapEnabled,
          verticalViewEnabled,
        },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    autoScrollEnabled,
    verticalViewEnabled,
    snapEnabled,
    videoLayoutMode,
    videoPreviewHeight,
    videoRightPanelWidth,
    zoomMode,
  ]);

  const closeShortcuts = useCallback(() => {
    setShowShortcuts(false);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsFocusMode(false);
  }, []);

  const toggleSnapEnabled = useCallback(() => {
    setSnapEnabled((prev) => !prev);
  }, []);

  return {
    zoomMode,
    setZoomMode,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    laneLabelWidth,
    timelineLaneHeights,
    handleLaneLabelWidthResizeStart,
    handleTimelineLaneHeightChange,
    videoPreviewHeight,
    videoRightPanelWidth,
    videoLayoutMode,
    setVideoLayoutMode,
    isResizingVideoPreview,
    isResizingVideoRightPanel,
    handleVideoPreviewResizeStart,
    handleVideoRightPanelResizeStart,
    autoScrollEnabled,
    setAutoScrollEnabled,
    isFocusMode,
    exitFocusMode,
    showShortcuts,
    closeShortcuts,
    snapEnabled,
    setSnapEnabled,
    toggleSnapEnabled,
    verticalViewEnabled,
    setVerticalViewEnabled,
    toggleVerticalViewEnabled,
  };
}