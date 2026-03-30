import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import type { VideoLayoutMode } from '../components/transcription/TranscriptionTimelineSections';
import type { LayerDocType } from '../db';
import { DEFAULT_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import { createLogger } from '../observability/logger';

const log = createLogger('TranscriptionWorkspaceLayout');

type UseTranscriptionWorkspaceLayoutControllerInput = {
  layers: LayerDocType[];
  selectedTimelineOwnerUtteranceId: string | undefined;
  utteranceRowRef: MutableRefObject<Record<string, HTMLDivElement | null>>;
};

type UseTranscriptionWorkspaceLayoutControllerResult = {
  zoomPercent: number;
  setZoomPercent: Dispatch<SetStateAction<number>>;
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
  hoverExpandEnabled: boolean;
  setHoverExpandEnabled: Dispatch<SetStateAction<boolean>>;
};

function readStoredClampedNumber(key: string, min: number, max: number, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  } catch (error) {
    log.warn('Failed to read numeric workspace layout preference from localStorage', {
      storageKey: key,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

function readStoredLaneHeights(): Record<string, number> {
  try {
    const stored = localStorage.getItem('jieyu:lane-heights');
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch (error) {
    log.warn('Failed to read lane heights from localStorage, fallback to default', {
      storageKey: 'jieyu:lane-heights',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return {};
}

function readStoredVideoLayoutMode(): VideoLayoutMode {
  try {
    const stored = localStorage.getItem('jieyu:video-layout-mode');
    return stored === 'right' || stored === 'left' ? stored : 'top';
  } catch (error) {
    log.warn('Failed to read video layout mode from localStorage, fallback to default', {
      storageKey: 'jieyu:video-layout-mode',
      error: error instanceof Error ? error.message : String(error),
    });
    return 'top';
  }
}

function resetDocumentResizeStyles(): void {
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
}

export function useTranscriptionWorkspaceLayoutController(
  input: UseTranscriptionWorkspaceLayoutControllerInput,
): UseTranscriptionWorkspaceLayoutControllerResult {
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomMode, setZoomMode] = useState<'fit-all' | 'fit-selection' | 'custom'>('fit-all');
  const [isTimelineLaneHeaderCollapsed, setIsTimelineLaneHeaderCollapsed] = useState(false);
  const [laneLabelWidth, setLaneLabelWidth] = useState<number>(() => readStoredClampedNumber('jieyu:lane-label-width', 40, 180, 64));
  const laneLabelWidthRef = useRef<number>(laneLabelWidth);
  const [timelineLaneHeights, setTimelineLaneHeights] = useState<Record<string, number>>(() => readStoredLaneHeights());
  const [videoPreviewHeight, setVideoPreviewHeight] = useState<number>(() => readStoredClampedNumber('jieyu:video-preview-height', 120, 600, 220));
  const videoPreviewResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [isResizingVideoPreview, setIsResizingVideoPreview] = useState(false);
  const [videoRightPanelWidth, setVideoRightPanelWidth] = useState<number>(() => readStoredClampedNumber('jieyu:video-right-panel-width', 260, 720, 360));
  const videoRightPanelResizeRef = useRef<{ startX: number; startWidth: number; factor: number } | null>(null);
  const [isResizingVideoRightPanel, setIsResizingVideoRightPanel] = useState(false);
  const [videoLayoutMode, setVideoLayoutMode] = useState<VideoLayoutMode>(() => readStoredVideoLayoutMode());
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [hoverExpandEnabled, setHoverExpandEnabled] = useState(true);

  useEffect(() => {
    laneLabelWidthRef.current = laneLabelWidth;
  }, [laneLabelWidth]);

  const toggleTimelineLaneHeader = useCallback(() => {
    setIsTimelineLaneHeaderCollapsed((prev) => !prev);
  }, []);

  const handleLaneLabelWidthResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isTimelineLaneHeaderCollapsed) return;

    const startX = event.clientX;
    const startWidth = laneLabelWidth;

    const onMove = (nextEvent: PointerEvent) => {
      const next = Math.max(40, Math.min(180, startWidth + (nextEvent.clientX - startX)));
      laneLabelWidthRef.current = next;
      setLaneLabelWidth(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
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
    if (!input.selectedTimelineOwnerUtteranceId) return;
    const row = input.utteranceRowRef.current[input.selectedTimelineOwnerUtteranceId];
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [autoScrollEnabled, input.selectedTimelineOwnerUtteranceId, input.utteranceRowRef]);

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
    } catch (error) {
      log.warn('Failed to persist video preview height to localStorage', {
        storageKey: 'jieyu:video-preview-height',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [videoPreviewHeight]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-layout-mode', videoLayoutMode);
    } catch (error) {
      log.warn('Failed to persist video layout mode to localStorage', {
        storageKey: 'jieyu:video-layout-mode',
        value: videoLayoutMode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [videoLayoutMode]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-right-panel-width', String(videoRightPanelWidth));
    } catch (error) {
      log.warn('Failed to persist video right panel width to localStorage', {
        storageKey: 'jieyu:video-right-panel-width',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [videoRightPanelWidth]);

  const closeShortcuts = useCallback(() => {
    setShowShortcuts(false);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsFocusMode(false);
  }, []);

  const toggleSnapEnabled = () => {
    setSnapEnabled((prev) => !prev);
  };

  return {
    zoomPercent,
    setZoomPercent,
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
    hoverExpandEnabled,
    setHoverExpandEnabled,
  };
}