import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  Focus,
  FolderPlus,
  Import,
  Maximize2,
  Merge,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Scissors,
  Settings,
  Trash2,
  Undo2,
  Square,
  Upload,
} from 'lucide-react';
import { AiAnalysisPanel } from '../components/AiAnalysisPanel';
import { AudioImportDialog } from '../components/AudioImportDialog';
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { ProjectSetupDialog } from '../components/ProjectSetupDialog';
import { SearchReplaceOverlay } from '../components/SearchReplaceOverlay';
import { WaveformToolbar } from '../components/WaveformToolbar';
import { TimelineAnnotationItem } from '../components/TimelineAnnotationItem';
import { LinguisticService } from '../../services/LinguisticService';
import { syncLayerToTier, validateLayerTierConsistency } from '../../services/TierBridgeService';
import { getDb } from '../../db';
import { exportToEaf, importFromEaf, downloadEaf, readFileAsText } from '../../services/EafService';
import type { EafImportResult } from '../../services/EafService';
import { snapToZeroCrossing } from '../services/AudioAnalysisService';
import { exportToTextGrid, importFromTextGrid, downloadTextGrid } from '../../services/TextGridService';
import type { TextGridImportResult } from '../../services/TextGridService';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useUtteranceOps } from '../hooks/useUtteranceOps';
import { useLasso, type SubSelectDrag } from '../hooks/useLasso';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useZoom } from '../hooks/useZoom';
import { useKeybindingActions } from '../hooks/useKeybindingActions';
import { fireAndForget } from '../utils/fireAndForget';
import {
  COMMON_LANGUAGES,
  formatTime,
  formatLayerRailLabel,
  getLayerLabelParts,
  normalizeSingleLine,
  newId,
} from '../utils/transcriptionFormatters';

export function TranscriptionPage() {
  // ---- Data layer (from hook) ----
  const data = useTranscriptionData();
  const {
    state,
    utterances,
    layers,
    translations,
    mediaItems,
    selectedUtteranceId,
    setSelectedUtteranceId,
    selectedUtteranceIds,
    setUtteranceSelection,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
    snapGuide,
    setSnapGuide,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    layerRailRows,
    deletableLayers,
    selectedUtterance,
    selectedUtteranceMedia,
    selectedMediaUrl,
    utterancesOnCurrentMedia,
    aiConfidenceAvg,
    translationTextByLayer,
    getUtteranceTextForLayer,
    selectedRowMeta,
    loadSnapshot,
    ensureDemoData,
    addMediaItem,
    saveVoiceTranslation,
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    selectUtterance,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
    setSelectedUtteranceIds,
    deleteSelectedUtterances,
    mergeSelectedUtterances,
    createLayer,
    deleteLayer,
    getNeighborBounds,
    makeSnapGuide,
    clearAutoSaveTimer,
    scheduleAutoSave,
    beginTimingGesture,
    endTimingGesture,
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  } = data;

  // ---- Recovery banner ----
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [recoveryDiffSummary, setRecoveryDiffSummary] = useState<{ utterances: number; translations: number; layers: number } | null>(null);
  const recoveryDataRef = useRef<Awaited<ReturnType<typeof checkRecovery>>>(null);

  useEffect(() => {
    if (data.state.phase !== 'ready') return;
    let cancelled = false;
    fireAndForget(checkRecovery().then((snap) => {
      if (cancelled || !snap) return;
      recoveryDataRef.current = snap;
      setRecoveryDiffSummary({
        utterances: Math.max(0, snap.utterances.length - utterances.length),
        translations: Math.max(0, snap.translations.length - translations.length),
        layers: Math.max(0, snap.layers.length - layers.length),
      });
      setRecoveryAvailable(true);
    }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.state.phase, utterances.length, translations.length, layers.length]);

  // ---- Page-only UI state ----
  const [focusedLayerRowId, setFocusedLayerRowId] = useState<string>('');

  const [lexemeMatches, setLexemeMatches] = useState<Array<{ id: string; lemma: Record<string, string> }>>([]);
  const [isLayerRailCollapsed, setIsLayerRailCollapsed] = useState(false);
  const [isAiPanelCollapsed, setIsAiPanelCollapsed] = useState(false);
  const [layerRailWidth, setLayerRailWidth] = useState(112);
  const [aiPanelWidth, setAiPanelWidth] = useState(320);

  const [showProjectSetup, setShowProjectSetup] = useState(false);
  const [showAudioImport, setShowAudioImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [layerActionPanel, setLayerActionPanel] = useState<'create-transcription' | 'create-translation' | 'delete' | null>(null);
  const layerActionRootRef = useRef<HTMLDivElement | null>(null);
  const [quickTranscriptionLangId, setQuickTranscriptionLangId] = useState('');
  const [quickTranscriptionCustomLang, setQuickTranscriptionCustomLang] = useState('');
  const [quickTranscriptionAlias, setQuickTranscriptionAlias] = useState('');
  const [quickTranslationLangId, setQuickTranslationLangId] = useState('');
  const [quickTranslationCustomLang, setQuickTranslationCustomLang] = useState('');
  const [quickTranslationAlias, setQuickTranslationAlias] = useState('');
  const [quickTranslationModality, setQuickTranslationModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [quickDeleteLayerId, setQuickDeleteLayerId] = useState('');
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [waveformFocused, setWaveformFocused] = useState(false);
  const [segmentLoopPlayback, setSegmentLoopPlayback] = useState(false);
  const [globalLoopPlayback, setGlobalLoopPlayback] = useState(false);
  const [segmentPlaybackRate, setSegmentPlaybackRate] = useState(1);
  const waveformAreaRef = useRef<HTMLDivElement | null>(null);

  const utteranceRowRef = useRef<Record<string, HTMLDivElement | null>>({});
  const waveCanvasRef = useRef<HTMLDivElement | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomMode, setZoomMode] = useState<'fit-all' | 'fit-selection' | 'custom'>('fit-all');
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [hoverTime, setHoverTime] = useState<{ time: number; x: number; y: number } | null>(null);
  const rulerDragRef = useRef<{ dragging: boolean; startX: number; startScroll: number }>({ dragging: false, startX: 0, startScroll: 0 });
  const [segMarkStart, setSegMarkStart] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; start: number; end: number } | null>(null);
  const skipSeekForIdRef = useRef<string | null>(null);
  /** True while an async createUtteranceFromSelection is in flight.
   *  Prevents onTimeUpdate from changing selection & consuming skipSeekForIdRef. */
  const creatingSegmentRef = useRef(false);
  /** True from Enter step-1 (mark start) until Escape.
   *  Suppresses onTimeUpdate auto-selection during continuous segment creation. */
  const markingModeRef = useRef(false);
  const manualSelectTsRef = useRef(0);

  const {
    recording,
    recordingUtteranceId,
    recordingLayerId,
    recordingError,
    startRecordingForUtterance,
    stopRecording,
  } = useRecording({
    saveVoiceTranslation,
    setSaveState,
    setSelectedUtteranceId,
    manualSelectTsRef,
  });

  const tierContainerRef = useRef<HTMLDivElement>(null);
  const listMainRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; utteranceId: string; splitTime: number } | null>(null);
  const [uttOpsMenu, setUttOpsMenu] = useState<{ x: number; y: number } | null>(null);

  // ---- Timeline resize state (not lasso) ----
  const [timelineResizeTooltip, setTimelineResizeTooltip] = useState<{
    x: number;
    y: number;
    start: number;
    end: number;
  } | null>(null);
  const timelineResizeDragRef = useRef<{
    utteranceId: string;
    mediaId: string;
    edge: 'start' | 'end';
    startClientX: number;
    initialStart: number;
    initialEnd: number;
    latestStart: number;
    latestEnd: number;
  } | null>(null);

  const {
    utteranceHasText,
    runDeleteSelection,
    runDeleteOne,
    runMergeSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useUtteranceOps({
    utterances,
    translationTextByLayer,
    deleteUtterance,
    deleteSelectedUtterances,
    mergeSelectedUtterances,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    selectAllBefore,
    selectAllAfter,
  });

  // Resolve active text id from loaded utterances or service
  const getActiveTextId = async (): Promise<string | null> => {
    if (activeTextId) return activeTextId;
    const texts = await LinguisticService.getAllTexts();
    const first = texts[0];
    if (first) {
      setActiveTextId(first.id);
      return first.id;
    }
    return null;
  };

  // Sync activeTextId when utterances load
  useEffect(() => {
    if (activeTextId) return;
    const firstTextId = utterances[0]?.textId;
    if (firstTextId) setActiveTextId(firstTextId);
  }, [utterances, activeTextId]);

  // ---- Player (WaveSurfer) ----

  const waveformRegions = useMemo(() =>
    utterancesOnCurrentMedia.map((item) => ({
      id: item.id,
      start: item.startTime,
      end: item.endTime,
    })),
    [utterancesOnCurrentMedia],
  );

  // --- 百分比 → px/s 换算 ---
  // 用 ref 追踪 duration 使得计算可以在 useWaveSurfer 调用前进行
  const lastDurationRef = useRef(0);
  const containerWidth = waveCanvasRef.current?.clientWidth || 800;

  // Refs for waveform lasso effect (avoid effect dependency churn)
  const zoomPxPerSecRef = useRef(0);
  const previousSelectedUtteranceIdRef = useRef(selectedUtteranceId);
  const safeDur = lastDurationRef.current;
  const fitPxPerSec = safeDur > 0 ? containerWidth / safeDur : 40;
  const zoomPxPerSec = fitPxPerSec * (zoomPercent / 100);
  zoomPxPerSecRef.current = zoomPxPerSec;
  const maxZoomPercent = Math.max(200, Math.ceil((2000 / fitPxPerSec) * 100));
  const isFitZoomMode = zoomMode === 'fit-all' || zoomMode === 'fit-selection';
  const shouldDisableAutoScroll = segmentLoopPlayback && isFitZoomMode;

  // Sub-selection state (shared between useLasso and useWaveSurfer)
  const [subSelectionRange, setSubSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const subSelectDragRef = useRef<SubSelectDrag | null>(null);

  const player = useWaveSurfer({
    mediaUrl: selectedMediaUrl,
    regions: waveformRegions,
    activeRegionIds: selectedUtteranceIds,
    primaryRegionId: selectedUtteranceId,
    waveformFocused,
    segmentLoop: segmentLoopPlayback,
    globalLoop: globalLoopPlayback,
    segmentPlaybackRate,
    autoScrollDuringPlayback: !shouldDisableAutoScroll,
    enableEmptyDragCreate: false,
    zoomLevel: zoomPxPerSec,
    startMarker: segMarkStart ?? undefined,
    subSelection: subSelectionRange,
    onRegionAltPointerDown: (regionId, time, pointerId, _clientX) => {
      // Begin sub-range drag
      subSelectDragRef.current = { active: false, regionId, anchorTime: time, pointerId };
      // Capture pointer on waveCanvasRef so we get pointermove/up
      waveCanvasRef.current?.setPointerCapture(pointerId);
    },
    onRegionClick: (regionId, clickTime, event) => {
      if (player.isPlaying) {
        player.stop();
      }
      setSubSelectionRange(null);
      manualSelectTsRef.current = Date.now();
      player.seekTo(clickTime);
      if (event.shiftKey) {
        const anchor = selectedUtteranceId || regionId;
        selectUtteranceRange(anchor, regionId);
      } else if (event.metaKey || event.ctrlKey) {
        toggleUtteranceSelection(regionId);
      } else {
        selectUtterance(regionId);
      }
    },
    onRegionDblClick: (_regionId, start, end) => {
      zoomToUtterance(start, end);
    },
    onRegionUpdate: (regionId, start, end) => {
      // Stop playback when the user starts dragging a boundary — playing
      // while adjusting boundaries leads to stale segmentBounds and confusing
      // behavior (playback ignoring the new boundary).
      if (player.isPlaying) {
        player.stop();
      }
      beginTimingGesture(regionId);
      setDragPreview({ id: regionId, start, end });
      const item = utterancesOnCurrentMedia.find((u) => u.id === regionId);
      if (item) {
        const bounds = getNeighborBounds(item.id, item.mediaId, start);
        setSnapGuide(makeSnapGuide(bounds, start, end));
      }
    },
    onRegionUpdateEnd: (regionId, start, end) => {
      endTimingGesture(regionId);
      setDragPreview(null);
      manualSelectTsRef.current = Date.now();
      setSelectedUtteranceId(regionId);
      // Snap to zero-crossing if enabled
      let finalStart = start;
      let finalEnd = end;
      if (snapEnabled) {
        const ws = player.instanceRef.current;
        const buf = ws?.getDecodedData();
        if (buf) {
          const snapped = snapToZeroCrossing(buf, start, end);
          finalStart = snapped.start;
          finalEnd = snapped.end;
        }
      }
      const item = utterancesOnCurrentMedia.find((u) => u.id === regionId);
      if (item) {
        const bounds = getNeighborBounds(item.id, item.mediaId, finalStart);
        setSnapGuide(makeSnapGuide(bounds, finalStart, finalEnd));
      }
      fireAndForget(saveUtteranceTiming(regionId, finalStart, finalEnd));
    },
    onRegionCreate: (start, end) => {
      fireAndForget(createUtteranceFromSelection(start, end));
    },
    onRegionContextMenu: (regionId, x, y) => {
      if (player.isPlaying) {
        player.stop();
      }
      setSelectedUtteranceId(regionId);
      // Convert click clientX → waveform time
      const ws = player.instanceRef.current;
      let splitTime = ws?.getCurrentTime() ?? 0;
      if (ws) {
        const wrapper = ws.getWrapper();
        const scrollParent = wrapper?.parentElement;
        if (wrapper && scrollParent) {
          const rect = scrollParent.getBoundingClientRect();
          const pxOffset = x - rect.left + scrollParent.scrollLeft;
          const totalWidth = wrapper.scrollWidth;
          const dur = ws.getDuration() || 1;
          splitTime = Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
        }
      }
      setCtxMenu({ x, y, utteranceId: regionId, splitTime });
    },
    onTimeUpdate: (time) => {
      if (Date.now() - manualSelectTsRef.current < 600) return;
      if (creatingSegmentRef.current) return;
      if (markingModeRef.current) return;
      // Binary search on sorted utterances
      const arr = utterancesOnCurrentMedia;
      let lo = 0, hi = arr.length - 1;
      let hit: typeof arr[0] | undefined;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const m = arr[mid];
        if (!m) break;
        if (time < m.startTime) { hi = mid - 1; }
        else if (time > m.endTime) { lo = mid + 1; }
        else { hit = m; break; }
      }
      if (hit && hit.id !== selectedUtteranceId) {
        setSelectedUtteranceId(hit.id);
      }
    },
  });

  // 同步 duration 到 ref（供下次渲染的 zoom 计算使用）
  if (player.duration > 0 && player.duration !== lastDurationRef.current) {
    lastDurationRef.current = player.duration;
  }

  // ---- Lasso / sub-selection (from hook) ----
  const {
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
  } = useLasso({
    waveCanvasRef,
    tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    selectedMediaUrl,
    utterancesOnCurrentMedia,
    selectedUtteranceIds,
    selectedUtteranceId,
    zoomPxPerSec,
    skipSeekForIdRef,
    clearUtteranceSelection,
    createUtteranceFromSelection,
    setUtteranceSelection,
    playerSeekTo: player.seekTo,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
  });

  // ---- Zoom (from hook) ----
  const { rulerView, zoomToPercent, zoomToUtterance } = useZoom({
    waveCanvasRef,
    tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    playerCurrentTime: player.currentTime,
    playerIsPlaying: player.isPlaying,
    selectedMediaUrl,
    zoomPercent,
    setZoomPercent,
    setZoomMode,
    fitPxPerSec,
    maxZoomPercent,
    zoomPxPerSec,
  });

  const startTimelineResizeDrag = useCallback((
    event: React.PointerEvent<HTMLSpanElement>,
    utterance: { id: string; mediaId?: string; startTime: number; endTime: number },
    edge: 'start' | 'end',
    layerId?: string,
  ) => {
    if (event.button !== 0) return;
    if (zoomPxPerSec <= 0) return;
    event.preventDefault();
    event.stopPropagation();

    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) {
      player.stop();
    }
    selectUtterance(utterance.id);
    if (layerId) {
      setSelectedLayerId(layerId);
      setFocusedLayerRowId(layerId);
    }

    beginTimingGesture(utterance.id);

    timelineResizeDragRef.current = {
      utteranceId: utterance.id,
      mediaId: utterance.mediaId ?? '',
      edge,
      startClientX: event.clientX,
      initialStart: utterance.startTime,
      initialEnd: utterance.endTime,
      latestStart: utterance.startTime,
      latestEnd: utterance.endTime,
    };
    setDragPreview({ id: utterance.id, start: utterance.startTime, end: utterance.endTime });
    setTimelineResizeTooltip({
      x: event.clientX,
      y: event.clientY,
      start: utterance.startTime,
      end: utterance.endTime,
    });

    const onMove = (ev: PointerEvent) => {
      const drag = timelineResizeDragRef.current;
      if (!drag || zoomPxPerSec <= 0) return;

      const deltaSec = (ev.clientX - drag.startClientX) / zoomPxPerSec;
      const minSpan = 0.05;
      const bounds = getNeighborBounds(drag.utteranceId, drag.mediaId, drag.initialStart);
      const rightBound = typeof bounds.right === 'number' ? bounds.right : Number.POSITIVE_INFINITY;
      let nextStart = drag.initialStart;
      let nextEnd = drag.initialEnd;

      if (drag.edge === 'start') {
        const lower = bounds.left;
        const upper = Math.min(drag.initialEnd - minSpan, rightBound - minSpan);
        if (upper <= lower) {
          nextStart = lower;
        } else {
          const rawStart = drag.initialStart + deltaSec;
          nextStart = Math.max(lower, Math.min(upper, rawStart));
        }
      } else {
        const lower = Math.max(drag.initialStart + minSpan, bounds.left + minSpan);
        const upper = rightBound;
        if (upper <= lower) {
          nextEnd = lower;
        } else {
          const rawEnd = drag.initialEnd + deltaSec;
          nextEnd = Math.max(lower, Math.min(upper, rawEnd));
        }
      }

      drag.latestStart = nextStart;
      drag.latestEnd = nextEnd;
      setDragPreview({ id: drag.utteranceId, start: nextStart, end: nextEnd });
      setTimelineResizeTooltip({
        x: ev.clientX,
        y: ev.clientY,
        start: nextStart,
        end: nextEnd,
      });

      const liveBounds = getNeighborBounds(drag.utteranceId, drag.mediaId, nextStart);
      setSnapGuide(makeSnapGuide(liveBounds, nextStart, nextEnd));
    };

    const onUp = () => {
      const drag = timelineResizeDragRef.current;
      timelineResizeDragRef.current = null;

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      if (!drag) return;

      let finalStart = drag.latestStart;
      let finalEnd = drag.latestEnd;
      if (snapEnabled) {
        const ws = player.instanceRef.current;
        const buf = ws?.getDecodedData();
        if (buf) {
          const snapped = snapToZeroCrossing(buf, finalStart, finalEnd);
          finalStart = snapped.start;
          finalEnd = snapped.end;
        }
      }

      setDragPreview(null);
      setTimelineResizeTooltip(null);
      endTimingGesture(drag.utteranceId);

      const bounds = getNeighborBounds(drag.utteranceId, drag.mediaId, finalStart);
      setSnapGuide(makeSnapGuide(bounds, finalStart, finalEnd));
      fireAndForget(saveUtteranceTiming(drag.utteranceId, finalStart, finalEnd));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [
    zoomPxPerSec,
    selectUtterance,
    setSelectedLayerId,
    beginTimingGesture,
    getNeighborBounds,
    makeSnapGuide,
    snapEnabled,
    player.instanceRef,
    endTimingGesture,
    saveUtteranceTiming,
  ]);

  // ---- Page-only derived values ----

  const selectedAiWarning = useMemo(() => {
    const base = selectedUtterance?.transcription.default ?? '';
    if (base.trim().length <= 1) return false;
    return lexemeMatches.length === 0;
  }, [lexemeMatches.length, selectedUtterance?.transcription.default]);

  // Keep focused layer rail row in sync with available layers.
  useEffect(() => {
    if (layerRailRows.length === 0) {
      if (focusedLayerRowId) {
        setFocusedLayerRowId('');
      }
      return;
    }

    const exists = layerRailRows.some((item) => item.id === focusedLayerRowId);
    if (!exists) {
      const fallback = layerRailRows.find((item) => item.id === selectedLayerId)?.id ?? layerRailRows[0]?.id ?? '';
      setFocusedLayerRowId(fallback);
    }
  }, [focusedLayerRowId, layerRailRows, selectedLayerId]);

  useEffect(() => {
    if (isLayerRailCollapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = listMainRef.current;
      if (!root) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!root.contains(target)) return;

      // 仅点击空白区域时自动收起；交互控件与内容块不触发。
      if (
        target.closest('.transcription-layer-rail') ||
        target.closest('.transcription-layer-rail-toggle') ||
        target.closest('.transcription-layer-rail-resizer') ||
        target.closest('.timeline-annotation') ||
        target.closest('.timeline-annotation-input') ||
        target.closest('.timeline-lane-label') ||
        target.closest('button, input, textarea, select, a, [role="button"]')
      ) {
        return;
      }

      setIsLayerRailCollapsed(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isLayerRailCollapsed]);

  useEffect(() => {
    if (isAiPanelCollapsed) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = workspaceRef.current;
      if (!root) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!root.contains(target)) return;

      if (
        target.closest('.transcription-ai-panel') ||
        target.closest('.transcription-ai-panel-toggle') ||
        target.closest('.transcription-ai-panel-resizer') ||
        target.closest('.timeline-annotation') ||
        target.closest('.timeline-annotation-input') ||
        target.closest('.timeline-lane-label') ||
        target.closest('.transcription-layer-rail') ||
        target.closest('.transcription-layer-rail-toggle') ||
        target.closest('button, input, textarea, select, a, [role="button"]')
      ) {
        return;
      }

      setIsAiPanelCollapsed(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isAiPanelCollapsed]);

  // Any target switch clears segment-loop mode, so the next play is manual non-loop by default.
  // Also reset segment playback rate to 1x for the new segment.
  useEffect(() => {
    const prev = previousSelectedUtteranceIdRef.current;
    if (prev !== selectedUtteranceId && segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
    }
    if (prev !== selectedUtteranceId) {
      setSegmentPlaybackRate(1);
    }
    previousSelectedUtteranceIdRef.current = selectedUtteranceId;
  }, [selectedUtteranceId, segmentLoopPlayback]);

  // Seek waveform to selected utterance's start.
  // Use a ref for isPlaying to avoid changing the dep array size and to prevent
  // re-running the effect when playback stops (which would yank the cursor).
  const isPlayingRef = useRef(player.isPlaying);
  isPlayingRef.current = player.isPlaying;
  useEffect(() => {
    if (!selectedUtterance || !player.isReady) return;
    if (skipSeekForIdRef.current) {
      skipSeekForIdRef.current = null;
      return;
    }
    // Don't yank the cursor while audio is playing (e.g. during
    // Enter-based continuous segment creation).
    if (isPlayingRef.current) return;
    player.seekTo(selectedUtterance.startTime);
  }, [selectedUtterance?.id, player.isReady, player.seekTo]);

  // ---- Keybinding system (from hook) ----
  const {
    handlePlayPauseAction,
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUtteranceFromInput,
  } = useKeybindingActions({
    player,
    subSelectionRange,
    setSubSelectionRange,
    selectedUtterance,
    selectedUtteranceId,
    selectedUtteranceIds,
    selectedMediaUrl,
    segMarkStart,
    setSegMarkStart,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    utterancesOnCurrentMedia,
    markingModeRef,
    skipSeekForIdRef,
    creatingSegmentRef,
    manualSelectTsRef,
    waveformAreaRef,
    createUtteranceFromSelection,
    selectUtterance,
    selectAllUtterances,
    setSelectedUtteranceId,
    runDeleteSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    undo,
    redo,
    setShowSearch,
  });

  const handleLayerRailToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsLayerRailCollapsed((prev) => !prev);
  }, []);

  const handleAiPanelToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsAiPanelCollapsed((prev) => !prev);
  }, []);

  const handleCreateTranscriptionFromPanel = useCallback(async () => {
    const languageId = (quickTranscriptionLangId === '__custom__' ? quickTranscriptionCustomLang : quickTranscriptionLangId).trim();
    const alias = quickTranscriptionAlias.trim();
    const success = await createLayer('transcription', {
      languageId,
      ...(alias ? { alias } : {}),
    });
    if (success) {
      setLayerActionPanel(null);
      setQuickTranscriptionLangId('');
      setQuickTranscriptionCustomLang('');
      setQuickTranscriptionAlias('');
    }
  }, [createLayer, quickTranscriptionAlias, quickTranscriptionCustomLang, quickTranscriptionLangId]);

  const handleCreateTranslationFromPanel = useCallback(async () => {
    const languageId = (quickTranslationLangId === '__custom__' ? quickTranslationCustomLang : quickTranslationLangId).trim();
    const alias = quickTranslationAlias.trim();
    const success = await createLayer('translation', {
      languageId,
      ...(alias ? { alias } : {}),
    }, quickTranslationModality);
    if (success) {
      setLayerActionPanel(null);
      setQuickTranslationLangId('');
      setQuickTranslationCustomLang('');
      setQuickTranslationAlias('');
      setQuickTranslationModality('text');
    }
  }, [createLayer, quickTranslationAlias, quickTranslationCustomLang, quickTranslationLangId, quickTranslationModality]);

  const handleDeleteLayerFromPanel = useCallback(async () => {
    if (!quickDeleteLayerId) return;
    await deleteLayer(quickDeleteLayerId);
    setLayerActionPanel(null);
  }, [deleteLayer, quickDeleteLayerId]);

  useEffect(() => {
    if (!deletableLayers.length) {
      setQuickDeleteLayerId('');
      return;
    }
    const exists = deletableLayers.some((l) => l.id === quickDeleteLayerId);
    if (exists) return;
    const focused = focusedLayerRowId
      ? deletableLayers.find((l) => l.id === focusedLayerRowId)
      : undefined;
    setQuickDeleteLayerId(focused?.id ?? deletableLayers[0]!.id);
  }, [deletableLayers, focusedLayerRowId, quickDeleteLayerId]);

  useEffect(() => {
    if (isLayerRailCollapsed) setLayerActionPanel(null);
  }, [isLayerRailCollapsed]);

  useEffect(() => {
    if (state.phase === 'ready') setLayerActionPanel(null);
  }, [state.phase]);

  useEffect(() => {
    if (!layerActionPanel) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (layerActionRootRef.current?.contains(target)) return;
      setLayerActionPanel(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLayerActionPanel(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [layerActionPanel]);

  const handleLayerRailResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isLayerRailCollapsed) return;

    const root = listMainRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = layerRailWidth;
    const minWidth = 84;
    const maxWidth = Math.min(280, rect.width * 0.45);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
      setLayerRailWidth(nextWidth);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [isLayerRailCollapsed, layerRailWidth]);

  const handleAiPanelResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isAiPanelCollapsed) return;

    const root = workspaceRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = aiPanelWidth;
    const minWidth = 240;
    const maxWidth = Math.min(560, rect.width * 0.6);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - dx));
      setAiPanelWidth(nextWidth);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [isAiPanelCollapsed, aiPanelWidth]);

  useEffect(() => {
    const query = (selectedUtterance?.transcription.default ?? '').trim();
    if (!query) {
      setLexemeMatches([]);
      return;
    }

    const token = query.split(/\s+/).filter(Boolean)[0] ?? '';
    if (!token) {
      setLexemeMatches([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void LinguisticService.searchLexemes(token)
        .then((items) => setLexemeMatches(items.slice(0, 8)))
        .catch(() => setLexemeMatches([]));
    }, 120);

    return () => window.clearTimeout(timer);
  }, [selectedUtterance?.id, selectedUtterance?.transcription.default]);

  useEffect(() => {
    if (!selectedUtterance) return;
    const row = utteranceRowRef.current[selectedUtterance.id];
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedUtterance?.id]);

  // ── Import / Export handlers ──

  const importFileRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const close = () => setShowExportMenu(false);
    window.addEventListener('pointerdown', close, { once: true });
    return () => window.removeEventListener('pointerdown', close);
  }, [showExportMenu]);

  const handleExportEaf = useCallback(() => {
    if (!selectedUtteranceMedia) return;
    const xml = exportToEaf({
      mediaItem: selectedUtteranceMedia,
      utterances: utterancesOnCurrentMedia,
      layers,
      translations,
    });
    const baseName = selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '');
    downloadEaf(xml, baseName);
    setSaveState({ kind: 'done', message: 'EAF 已导出。' });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState]);

  const handleExportTextGrid = useCallback(() => {
    if (!selectedUtteranceMedia) return;
    const tg = exportToTextGrid({
      utterances: utterancesOnCurrentMedia,
      layers,
      translations,
    });
    const baseName = selectedUtteranceMedia.filename.replace(/\.[^.]+$/, '');
    downloadTextGrid(tg, baseName);
    setSaveState({ kind: 'done', message: 'TextGrid 已导出。' });
    setShowExportMenu(false);
  }, [selectedUtteranceMedia, utterancesOnCurrentMedia, layers, translations, setSaveState]);

  const handleImportFile = useCallback(async (file: File) => {
    const text = await readFileAsText(file);
    const name = file.name.toLowerCase();

    try {
      let eafResult: EafImportResult | null = null;
      let tgResult: TextGridImportResult | null = null;

      if (name.endsWith('.eaf')) {
        eafResult = importFromEaf(text);
      } else if (name.endsWith('.textgrid')) {
        tgResult = importFromTextGrid(text);
      } else {
        setSaveState({ kind: 'error', message: '不支持的文件格式，请选择 .eaf 或 .TextGrid 文件。' });
        return;
      }

      const parsedUtterances = eafResult?.utterances ?? tgResult!.utterances;
      const additionalTiers: Map<string, Array<{ startTime: number; endTime: number; text: string }>> =
        eafResult?.translationTiers ?? tgResult!.additionalTiers;

      const textId = activeTextId ?? (await getActiveTextId());
      if (!textId) { setSaveState({ kind: 'error', message: '请先创建项目。' }); return; }
      const mediaId = selectedUtteranceMedia?.id ?? '';
      const db = await getDb();
      const now = new Date().toISOString();

      // Insert utterances and track id-to-time mapping for tier matching
      const insertedUtterances: Array<{ id: string; startTime: number; endTime: number }> = [];
      for (const u of parsedUtterances) {
        const id = newId('utt');
        const startTime = Number(u.startTime.toFixed(3));
        const endTime = Number(u.endTime.toFixed(3));
        await db.collections.utterances.insert({
          id,
          textId,
          mediaId,
          transcription: { default: u.transcription },
          startTime,
          endTime,
          isVerified: false,
          createdAt: now,
          updatedAt: now,
        });
        insertedUtterances.push({ id, startTime, endTime });
      }

      // Import additional tiers as layers + utterance_translations
      let tierCount = 0;
      for (const [tierName, annotations] of additionalTiers) {
        if (annotations.length === 0) continue;
        tierCount++;

        // Create a translation layer for this tier
        const layerId = newId('layer');
        const suffix = Math.random().toString(36).slice(2, 7);
        const key = `trl_import_${suffix}`;
        const newLayer = {
          id: layerId,
          key,
          name: { eng: tierName, zho: tierName },
          layerType: 'translation' as const,
          languageId: 'und', // undetermined — user can edit later
          modality: 'text' as const,
          acceptsAudio: false,
          sortOrder: tierCount + 1,
          createdAt: now,
          updatedAt: now,
        };
        await db.collections.translation_layers.insert(newLayer);

        // Sync bridge tier
        fireAndForget(syncLayerToTier(newLayer as import('../../db').TranslationLayerDocType, textId));

        // Match annotations to utterances by closest time overlap
        for (const ann of annotations) {
          const annStart = Number(ann.startTime.toFixed(3));
          const annEnd = Number(ann.endTime.toFixed(3));
          const match = insertedUtterances.find(
            (u) => Math.abs(u.startTime - annStart) < 0.01 && Math.abs(u.endTime - annEnd) < 0.01,
          );
          if (match && ann.text.trim()) {
            await db.collections.utterance_translations.insert({
              id: newId('utr'),
              utteranceId: match.id,
              translationLayerId: layerId,
              modality: 'text' as const,
              text: ann.text,
              sourceType: 'human' as const,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      // Post-import consistency check (non-blocking)
      fireAndForget(
        validateLayerTierConsistency(textId).then((issues) => {
          if (issues.length > 0) {
            console.warn('[TierBridge] Post-import consistency issues:', issues);
          }
        }),
      );

      await loadSnapshot();
      const extra = tierCount > 0 ? `，含 ${tierCount} 个额外层` : '';
      setSaveState({ kind: 'done', message: `已导入 ${parsedUtterances.length} 条句段${extra}。` });
    } catch (err) {
      setSaveState({ kind: 'error', message: `导入失败: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [activeTextId, selectedUtteranceMedia, loadSnapshot, setSaveState]);

  // ── Search / Replace ──

  const searchableItems = useMemo(() => {
    const items: Array<{ utteranceId: string; layerId?: string; text: string }> = [];

    if (transcriptionLayers.length === 0) {
      for (const utt of utterancesOnCurrentMedia) {
        items.push({ utteranceId: utt.id, text: utt.transcription?.default ?? '' });
      }
    } else {
      for (const layer of transcriptionLayers) {
        for (const utt of utterancesOnCurrentMedia) {
          const text = getUtteranceTextForLayer(utt, layer.id);
          if (text) items.push({ utteranceId: utt.id, layerId: layer.id, text });
        }
      }
    }

    for (const layer of translationLayers) {
      const layerMap = translationTextByLayer.get(layer.id);
      if (!layerMap) continue;
      for (const utt of utterancesOnCurrentMedia) {
        const tr = layerMap.get(utt.id);
        if (tr?.text) items.push({ utteranceId: utt.id, layerId: layer.id, text: tr.text });
      }
    }
    return items;
  }, [getUtteranceTextForLayer, transcriptionLayers, translationLayers, translationTextByLayer, utterancesOnCurrentMedia]);

  const handleSearchReplace = useCallback(
    (utteranceId: string, layerId: string | undefined, _oldText: string, newText: string) => {
      if (layerId) {
        const targetLayer = layers.find((layer) => layer.id === layerId);
        if (targetLayer?.layerType === 'transcription') {
          fireAndForget(saveUtteranceText(utteranceId, newText, layerId));
        } else {
          fireAndForget(saveTextTranslationForUtterance(utteranceId, newText, layerId));
        }
      } else {
        fireAndForget(saveUtteranceText(utteranceId, newText));
      }
    },
    [layers, saveTextTranslationForUtterance, saveUtteranceText],
  );

  const timelineRenderUtterances = useMemo(() => {
    if (!rulerView || player.duration <= 0) return utterancesOnCurrentMedia;
    const viewSpan = Math.max(0, rulerView.end - rulerView.start);
    const buffer = Math.max(1, viewSpan * 0.45);
    const left = Math.max(0, rulerView.start - buffer);
    const right = Math.min(player.duration, rulerView.end + buffer);
    return utterancesOnCurrentMedia.filter((utt) => utt.endTime >= left && utt.startTime <= right);
  }, [utterancesOnCurrentMedia, rulerView, player.duration]);

  const renderTimeRuler = () => {
    if (!(player.isReady && player.duration > 0 && rulerView)) return null;

    const dur = player.duration;
    const { start, end } = rulerView;
    const windowSec = end - start;
    if (windowSec <= 0) return null;

    const NICE = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const approxPxPerSec = Math.max(zoomPxPerSec, 1);
    const majorStep = NICE.find((s) => s * approxPxPerSec >= 120) ?? 600;
    const SUB = [10, 5, 4, 2, 1];
    const subDiv = SUB.find((d) => (majorStep / d) * approxPxPerSec >= 28) ?? 1;
    const minorStep = majorStep / subDiv;

    const showMs = majorStep < 1;
    const showHour = dur >= 3600;
    const fmtLabel = (t: number) => {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const sRaw = t % 60;
      if (showMs) {
        const sStr = sRaw.toFixed(1).padStart(4, '0');
        return showHour ? `${h}:${String(m).padStart(2, '0')}:${sStr}` : `${m}:${sStr}`;
      }
      let sInt = Math.round(sRaw);
      let mAdj = m;
      let hAdj = h;
      if (sInt >= 60) { sInt = 0; mAdj += 1; }
      if (mAdj >= 60) { mAdj = 0; hAdj += 1; }
      const ss = String(sInt).padStart(2, '0');
      return showHour
        ? `${hAdj}:${String(mAdj).padStart(2, '0')}:${ss}`
        : `${mAdj}:${ss}`;
    };

    const ticks: Array<{ time: number; kind: 'major' | 'minor' }> = [];
    const t0 = Math.max(0, Math.floor(start / minorStep) * minorStep);
    for (let t = t0; t <= Math.min(end, dur) + 1e-9; t += minorStep) {
      const rounded = Math.round(t * 1e6) / 1e6;
      if (rounded > dur) break;
      const ratio = rounded / majorStep;
      const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6;
      ticks.push({ time: rounded, kind: isMajor ? 'major' : 'minor' });
    }

    return (
      <div
        className="time-ruler"
        onClick={(e) => {
          if (rulerDragRef.current.dragging) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          player.seekTo(Math.max(0, Math.min(dur, start + ratio * windowSec)));
        }}
        onMouseDown={(e) => {
          const el = waveCanvasRef.current;
          if (!el) return;
          const ws = player.instanceRef.current;
          rulerDragRef.current = { dragging: false, startX: e.clientX, startScroll: ws ? ws.getScroll() : 0 };
          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - rulerDragRef.current.startX;
            if (Math.abs(dx) > 3) rulerDragRef.current.dragging = true;
            if (rulerDragRef.current.dragging && ws) {
              const target = rulerDragRef.current.startScroll - dx;
              ws.setScroll(target);
              if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
            }
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            setTimeout(() => { rulerDragRef.current.dragging = false; }, 0);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        {ticks.map((tk) => {
          const leftPct = `${((tk.time - start) / windowSec) * 100}%`;
          return (
            <Fragment key={`tk-${tk.time}`}>
              <div
                className={`time-ruler-tick ${tk.kind === 'major' ? 'time-ruler-tick-major' : ''}`}
                style={{ left: leftPct }}
              />
              {tk.kind === 'major' && (
                <div
                  className="time-ruler-label"
                  style={{ left: leftPct }}
                >
                  {fmtLabel(tk.time)}
                </div>
              )}
            </Fragment>
          );
        })}
        <div
          className="time-ruler-cursor"
          style={{ left: `${((player.currentTime - start) / windowSec) * 100}%` }}
        />
      </div>
    );
  };

  // ── Shared timeline annotation handlers ──

  const handleAnnotationClick = (
    uttId: string, layerId: string, e: React.MouseEvent,
  ) => {
    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) player.stop();
    if (e.shiftKey && selectedUtteranceId) {
      selectUtteranceRange(selectedUtteranceId, uttId);
    } else if (e.metaKey || e.ctrlKey) {
      toggleUtteranceSelection(uttId);
    } else {
      selectUtterance(uttId);
    }
    setSelectedLayerId(layerId);
    setFocusedLayerRowId(layerId);
  };

  const handleAnnotationContextMenu = (
    uttId: string, utt: { startTime: number; endTime: number },
    layerId: string, e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) player.stop();
    selectUtterance(uttId);
    setSelectedLayerId(layerId);
    setFocusedLayerRowId(layerId);
    const sc = tierContainerRef.current;
    let splitTime = utt.startTime;
    if (sc && zoomPxPerSec > 0) {
      const rect = sc.getBoundingClientRect();
      const contentX = e.clientX - rect.left + sc.scrollLeft;
      splitTime = contentX / zoomPxPerSec;
    }
    const min = utt.startTime + 0.001;
    const max = utt.endTime - 0.001;
    splitTime = Math.max(min, Math.min(max, splitTime));
    setCtxMenu({ x: e.clientX, y: e.clientY, utteranceId: uttId, splitTime });
  };

  const handleAnnotationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      navigateUtteranceFromInput(e, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      waveformAreaRef.current?.focus();
    } else if (e.key === 'Escape') {
      (e.target as HTMLInputElement).blur();
      waveformAreaRef.current?.focus();
    }
  };

  return (
    <section className="transcription-screen">
      {state.phase === 'loading' && <p className="hint">正在连接本地数据库...</p>}
      {state.phase === 'error' && <p className="error">数据库连接失败：{state.message}</p>}

      {state.phase === 'ready' && (
        <>
          {/* Recovery banner */}
          {recoveryAvailable && (
            <div style={{
              background: '#fef3c7', borderBottom: '1px solid #f59e0b', padding: '8px 16px',
              display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
            }}>
              <span>
                检测到未保存的编辑数据，是否恢复？
                {recoveryDiffSummary && (
                  <>
                    {' '}（预计恢复 +{recoveryDiffSummary.utterances} 句段 / +{recoveryDiffSummary.translations} 翻译 / +{recoveryDiffSummary.layers} 层）
                  </>
                )}
              </span>
              <button
                style={{ padding: '2px 10px', borderRadius: 4, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  const snap = recoveryDataRef.current;
                  if (snap) fireAndForget(applyRecovery(snap));
                  setRecoveryAvailable(false);
                }}
              >
                恢复
              </button>
              <button
                style={{ padding: '2px 10px', borderRadius: 4, background: '#e5e7eb', border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  fireAndForget(dismissRecovery());
                  setRecoveryAvailable(false);
                }}
              >
                忽略
              </button>
            </div>
          )}
          {/* Waveform workspace: unified toolbar and interactive timeline. */}
          <section className="transcription-waveform">
            <WaveformToolbar
              filename={selectedUtteranceMedia?.filename ?? '未绑定音频'}
              isReady={player.isReady}
              isPlaying={player.isPlaying}
              playbackRate={player.playbackRate}
              onPlaybackRateChange={player.setPlaybackRate}
              volume={player.volume}
              onVolumeChange={player.setVolume}
              loop={globalLoopPlayback}
              onLoopChange={setGlobalLoopPlayback}
              onTogglePlayback={handleGlobalPlayPauseAction}
              onSeek={player.seekBySeconds}
            >
              <button className="icon-btn" onClick={() => fireAndForget(loadSnapshot())} title="刷新数据">
                <RefreshCw size={16} />
              </button>
              <button className="icon-btn" onClick={() => setShowProjectSetup(true)} title="新建项目">
                <FolderPlus size={16} />
              </button>
              <button className="icon-btn" onClick={() => setShowAudioImport(true)} title="导入音频" disabled={!activeTextId}>
                <Import size={16} />
              </button>
              <button
                className="icon-btn icon-btn-danger"
                title="删除当前音频"
                disabled={!selectedUtteranceMedia}
                onClick={() => {
                  if (!selectedUtteranceMedia) return;
                  if (!window.confirm(`确定删除音频「${selectedUtteranceMedia.filename}」及其所有句段？`)) return;
                  fireAndForget((async () => {
                    await LinguisticService.deleteAudio(selectedUtteranceMedia.id);
                    await loadSnapshot();
                    setSelectedUtteranceId('');
                    setSaveState({ kind: 'done', message: '音频已删除。' });
                  })());
                }}
              >
                <Trash2 size={16} />
              </button>
              <button
                className="icon-btn icon-btn-danger"
                title="删除当前项目"
                disabled={!activeTextId}
                onClick={() => {
                  if (!activeTextId) return;
                  if (!window.confirm('确定删除当前项目及其所有数据（音频、句段、翻译）？此操作不可撤销。')) return;
                  fireAndForget((async () => {
                    await LinguisticService.deleteProject(activeTextId);
                    setActiveTextId(null);
                    setSelectedUtteranceId('');
                    await loadSnapshot();
                    setSaveState({ kind: 'done', message: '项目已删除。' });
                  })());
                }}
              >
                <Trash2 size={14} />
              </button>
              <button className="icon-btn" onClick={() => fireAndForget(ensureDemoData())} title="示例数据">
                <Settings size={16} />
              </button>
              <span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
              {/* Export dropdown */}
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <button
                  className="icon-btn"
                  title="导出 EAF / TextGrid"
                  disabled={!selectedUtteranceMedia || utterancesOnCurrentMedia.length === 0}
                  onClick={() => setShowExportMenu((v) => !v)}
                >
                  <Download size={16} />
                  <ChevronDown size={12} style={{ marginLeft: 2 }} />
                </button>
                {showExportMenu && (
                  <div
                    style={{
                      position: 'absolute', top: '100%', left: 0, zIndex: 100,
                      background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
                      boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: '4px 0',
                    }}
                  >
                    <button
                      style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
                      onClick={handleExportEaf}
                    >
                      导出为 EAF (.eaf)
                    </button>
                    <button
                      style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
                      onClick={handleExportTextGrid}
                    >
                      导出为 TextGrid
                    </button>
                  </div>
                )}
              </span>
              {/* Import EAF / TextGrid */}
              <button
                className="icon-btn"
                title="导入 EAF / TextGrid"
                onClick={() => importFileRef.current?.click()}
              >
                <Upload size={16} />
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".eaf,.textgrid,.TextGrid"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) fireAndForget(handleImportFile(file));
                  e.target.value = '';
                }}
              />
              <span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
              <button
                className="icon-btn"
                title="句段操作"
                disabled={!selectedUtteranceId}
                onClick={(e) => {
                  if (!selectedUtteranceId) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setUttOpsMenu({ x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <Scissors size={15} />
                <ChevronDown size={12} style={{ marginLeft: 2 }} />
              </button>
            </WaveformToolbar>
            <div
              ref={waveformAreaRef}
              className={`transcription-waveform-area ${snapGuide.nearSide ? 'transcription-waveform-area-snapping' : ''} ${segMarkStart !== null ? 'transcription-waveform-area-marking' : ''}`}
              tabIndex={0}
              onKeyDown={handleWaveformKeyDown}
              onFocus={() => setWaveformFocused(true)}
              onBlur={() => setWaveformFocused(false)}
              onMouseMove={(e) => {
                const el = waveCanvasRef.current;
                if (!el || !player.isReady) { setHoverTime(null); return; }
                const rect = el.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom + 30) {
                  setHoverTime(null); return;
                }
                const ws = player.instanceRef.current;
                const scrollLeft = ws ? ws.getScroll() : 0;
                const time = (scrollLeft + (e.clientX - rect.left)) / zoomPxPerSec;
                setHoverTime({ time: Math.max(0, Math.min(time, player.duration)), x: e.clientX, y: rect.top - 4 });
              }}
              onMouseLeave={() => setHoverTime(null)}
            >
              {hoverTime && (
                <div className="waveform-hover-tooltip" style={{ left: hoverTime.x, top: hoverTime.y }}>
                  {formatTime(hoverTime.time)}
                </div>
              )}
              {selectedMediaUrl ? (
                <>
                  <div
                    ref={(el) => {
                      waveCanvasRef.current = el;
                      player.waveformRef.current = el;
                    }}
                    className="wave-canvas transcription-wave-canvas"
                  />
                  {waveLassoRect && (
                    <div
                      className={`wave-lasso-rect ${waveLassoRect.mode === 'create' ? 'wave-lasso-rect-create' : 'wave-lasso-rect-select'}`}
                      style={{
                        left: waveLassoRect.x,
                        top: waveLassoRect.y,
                        width: waveLassoRect.w,
                        height: waveLassoRect.h,
                      }}
                    >
                      {waveLassoRect.mode === 'select' && (
                        <div className="wave-lasso-hint">
                          {`将选中 ${waveLassoHintCount} 条语段`}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedUtterance && player.isReady && (() => {
                    const ws = player.instanceRef.current;
                    const scrollLeft = ws ? ws.getScroll() : 0;
                    const leftPx = selectedUtterance.startTime * zoomPxPerSec - scrollLeft;
                    const widthPx = (selectedUtterance.endTime - selectedUtterance.startTime) * zoomPxPerSec;
                    // Hide if region is scrolled out of view or too narrow
                    if (leftPx + widthPx < 0 || leftPx > (ws?.getWidth() ?? 9999)) return null;
                    const showSpeedSlider = widthPx >= 160;
                    const showLoopBtn = widthPx >= 72;
                    return (
                      <div
                        className="region-action-overlay"
                        style={{ left: Math.max(0, leftPx) }}
                      >
                        {showSpeedSlider && (
                          <div className="segment-speed-control" onPointerDown={(e) => e.stopPropagation()}>
                          <input
                            type="range"
                            className="segment-speed-slider"
                            min={0.25}
                            max={2}
                            step={0.05}
                            value={segmentPlaybackRate}
                            onChange={(e) => {
                              const rate = Number(e.target.value);
                              setSegmentPlaybackRate(rate);
                              // If segment is currently playing, apply immediately
                              const ws = player.instanceRef.current;
                              if (ws && player.isPlaying) {
                                ws.setPlaybackRate(rate);
                              }
                            }}
                            title={`语段播放速度: ${segmentPlaybackRate.toFixed(2)}x`}
                          />
                          <span
                            className={`segment-speed-label${segmentPlaybackRate !== 1 ? ' segment-speed-label-reset' : ''}`}
                            title={segmentPlaybackRate !== 1 ? '点击恢复原速' : '当前为原速'}
                            onClick={() => {
                              setSegmentPlaybackRate(1);
                              const ws = player.instanceRef.current;
                              if (ws && player.isPlaying) {
                                ws.setPlaybackRate(1);
                              }
                            }}
                          >{segmentPlaybackRate === 1 ? '1x' : `${segmentPlaybackRate.toFixed(segmentPlaybackRate % 0.25 === 0 ? 1 : 2)}x`}</span>
                        </div>
                        )}
                        {showLoopBtn && (
                        <button
                          className={`region-action-btn ${segmentLoopPlayback ? 'region-action-btn-active' : ''}`}
                          title={segmentLoopPlayback ? '关闭语段循环播放' : '循环播放该语段'}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (segmentLoopPlayback) {
                              setSegmentLoopPlayback(false);
                              player.stop();
                            } else {
                              setSegmentLoopPlayback(true);
                              const s = subSelectionRange ?? { start: selectedUtterance.startTime, end: selectedUtterance.endTime };
                              player.playRegion(s.start, s.end, true);
                            }
                          }}
                        >
                          <Repeat size={13} />
                        </button>
                        )}
                        <button
                          className="region-action-btn"
                          title={player.isPlaying ? '停止播放' : '播放该语段'}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (player.isPlaying) {
                              player.stop();
                            } else {
                              const s = subSelectionRange ?? { start: selectedUtterance.startTime, end: selectedUtterance.endTime };
                              player.playRegion(s.start, s.end, true);
                            }
                          }}
                        >
                          {player.isPlaying ? <Square size={13} /> : <Play size={13} />}
                        </button>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="wave-empty transcription-wave-empty">
                  当前句子未绑定源音频，请先切换到带音频的句子或导入包含 mediaId 的数据。
                </div>
              )}
              {snapGuide.visible && player.duration > 0 && rulerView && (() => {
                const windowSec = rulerView.end - rulerView.start;
                if (windowSec <= 0) return null;
                const pctL = ((snapGuide.left ?? 0) - rulerView.start) / windowSec * 100;
                const pctR = typeof snapGuide.right === 'number' ? (snapGuide.right - rulerView.start) / windowSec * 100 : null;
                return (
                  <>
                    <div
                      className={`snap-line snap-line-left ${snapGuide.nearSide === 'left' || snapGuide.nearSide === 'both' ? 'snap-line-near' : ''}`}
                      style={{ left: `${pctL}%` }}
                    >
                      <span>L</span>
                    </div>
                    {pctR !== null && (
                      <div
                        className={`snap-line snap-line-right ${snapGuide.nearSide === 'right' || snapGuide.nearSide === 'both' ? 'snap-line-near' : ''}`}
                        style={{ left: `${pctR}%` }}
                      >
                        <span>R</span>
                      </div>
                    )}
                  </>
                );
              })()}
              {segMarkStart !== null && (
                <div className="seg-mark-status">
                  ✦ 起点 {formatTime(segMarkStart)} — 再按 <kbd>Enter</kbd> 设置终点并创建句段，<kbd>Esc</kbd> 取消
                </div>
              )}
            </div>
            {renderTimeRuler()}
          </section>

          {/* Editor workspace: left side for row editing, right side for AI guidance. */}
          <main
            ref={workspaceRef}
            className={`transcription-workspace ${isAiPanelCollapsed ? 'transcription-workspace-ai-collapsed' : ''}`}
            style={{
              '--transcription-ai-width': `${aiPanelWidth}px`,
              '--transcription-ai-visible-width': `${isAiPanelCollapsed ? 0 : aiPanelWidth}px`,
            } as React.CSSProperties}
          >
            <section className="transcription-list-panel" style={{ position: 'relative' }}>
              {showSearch && (
                <SearchReplaceOverlay
                  items={searchableItems}
                  currentLayerId={selectedLayerId || undefined}
                  currentUtteranceId={selectedUtteranceId || undefined}
                  onNavigate={(id) => {
                    manualSelectTsRef.current = Date.now();
                    if (player.isPlaying) {
                      player.stop();
                    }
                    selectUtterance(id);
                  }}
                  onReplace={handleSearchReplace}
                  onClose={() => setShowSearch(false)}
                />
              )}
              <div
                ref={listMainRef}
                className={`transcription-list-main ${isLayerRailCollapsed ? 'transcription-list-main-rail-collapsed' : ''}`}
                style={{ '--transcription-rail-width': `${isLayerRailCollapsed ? 0 : layerRailWidth}px` } as React.CSSProperties}
              >
                <aside className={`transcription-layer-rail ${isLayerRailCollapsed ? 'transcription-layer-rail-collapsed' : ''}`} aria-label="文本区层滚动栏">
                  <div className="transcription-layer-rail-overview">
                    {layerRailRows.length > 0 ? (
                      layerRailRows.map((layer) => {
                        const layerLabel = formatLayerRailLabel(layer);
                        const isActiveLayer = layer.id === focusedLayerRowId;
                        return (
                          <button
                            key={layer.id}
                            type="button"
                            className={`transcription-layer-rail-item ${isActiveLayer ? 'transcription-layer-rail-item-active' : ''}`}
                            onClick={() => {
                              setFocusedLayerRowId(layer.id);
                            }}
                          >
                            <strong>{layerLabel}</strong>
                          </button>
                        );
                      })
                    ) : (
                      <span className="transcription-layer-rail-empty">暂无层</span>
                    )}
                  </div>
                  <div className="transcription-layer-rail-actions" aria-label="层管理快捷操作" ref={layerActionRootRef}>
                    <button
                      type="button"
                      className={`transcription-layer-rail-action-btn ${layerActionPanel === 'create-transcription' ? 'transcription-layer-rail-action-btn-active' : ''}`}
                      onClick={() => setLayerActionPanel((prev) => (prev === 'create-transcription' ? null : 'create-transcription'))}
                    >
                      <strong>新建转写</strong>
                    </button>
                    <button
                      type="button"
                      className={`transcription-layer-rail-action-btn ${layerActionPanel === 'create-translation' ? 'transcription-layer-rail-action-btn-active' : ''}`}
                      onClick={() => setLayerActionPanel((prev) => (prev === 'create-translation' ? null : 'create-translation'))}
                    >
                      <strong>新建翻译</strong>
                    </button>
                    <button
                      type="button"
                      className={`transcription-layer-rail-action-btn transcription-layer-rail-action-btn-danger ${layerActionPanel === 'delete' ? 'transcription-layer-rail-action-btn-active' : ''}`}
                      disabled={!focusedLayerRowId || deletableLayers.length === 0}
                      onClick={() => setLayerActionPanel((prev) => (prev === 'delete' ? null : 'delete'))}
                    >
                      <strong>删除</strong>
                    </button>

                    {layerActionPanel === 'create-transcription' && (
                      <div className="transcription-layer-rail-action-popover" role="dialog" aria-label="新建转写层">
                        <select
                          className="input transcription-layer-rail-action-input"
                          value={quickTranscriptionLangId}
                          onChange={(e) => setQuickTranscriptionLangId(e.target.value)}
                        >
                          <option value="">选择语言…</option>
                          {COMMON_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                          ))}
                          <option value="__custom__">其他（手动输入）</option>
                        </select>
                        {quickTranscriptionLangId === '__custom__' && (
                          <input
                            className="input transcription-layer-rail-action-input"
                            placeholder="ISO 639-3 代码（如 tib）"
                            value={quickTranscriptionCustomLang}
                            onChange={(e) => setQuickTranscriptionCustomLang(e.target.value)}
                          />
                        )}
                        <input
                          className="input transcription-layer-rail-action-input"
                          placeholder="别名（可选）"
                          value={quickTranscriptionAlias}
                          onChange={(e) => setQuickTranscriptionAlias(e.target.value)}
                        />
                        <div className="transcription-layer-rail-action-row">
                          <button className="btn btn-sm" onClick={() => { fireAndForget(handleCreateTranscriptionFromPanel()); }}>创建</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>取消</button>
                        </div>
                      </div>
                    )}

                    {layerActionPanel === 'create-translation' && (
                      <div className="transcription-layer-rail-action-popover" role="dialog" aria-label="新建翻译层">
                        <select
                          className="input transcription-layer-rail-action-input"
                          value={quickTranslationLangId}
                          onChange={(e) => setQuickTranslationLangId(e.target.value)}
                        >
                          <option value="">选择语言…</option>
                          {COMMON_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                          ))}
                          <option value="__custom__">其他（手动输入）</option>
                        </select>
                        {quickTranslationLangId === '__custom__' && (
                          <input
                            className="input transcription-layer-rail-action-input"
                            placeholder="ISO 639-3 代码（如 tib）"
                            value={quickTranslationCustomLang}
                            onChange={(e) => setQuickTranslationCustomLang(e.target.value)}
                          />
                        )}
                        <input
                          className="input transcription-layer-rail-action-input"
                          placeholder="别名（可选）"
                          value={quickTranslationAlias}
                          onChange={(e) => setQuickTranslationAlias(e.target.value)}
                        />
                        <select
                          className="input transcription-layer-rail-action-input"
                          value={quickTranslationModality}
                          onChange={(e) => setQuickTranslationModality(e.target.value as 'text' | 'audio' | 'mixed')}
                        >
                          <option value="text">文本（纯文字翻译）</option>
                          <option value="audio">语音（口译录音）</option>
                          <option value="mixed">混合（文字 + 录音）</option>
                        </select>
                        <div className="transcription-layer-rail-action-row">
                          <button className="btn btn-sm" onClick={() => { fireAndForget(handleCreateTranslationFromPanel()); }}>创建</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>取消</button>
                        </div>
                      </div>
                    )}

                    {layerActionPanel === 'delete' && (
                      <div className="transcription-layer-rail-action-popover" role="dialog" aria-label="删除层">
                        <select
                          className="input transcription-layer-rail-action-input"
                          value={quickDeleteLayerId}
                          onChange={(e) => setQuickDeleteLayerId(e.target.value)}
                        >
                          {deletableLayers.map((layer) => (
                            <option key={layer.id} value={layer.id}>
                              {(layer.name.zho ?? layer.name.zh ?? layer.name.eng ?? layer.name.en ?? layer.key)}
                            </option>
                          ))}
                        </select>
                        <div className="transcription-layer-rail-action-row">
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={!quickDeleteLayerId}
                            onClick={() => { fireAndForget(handleDeleteLayerFromPanel()); }}
                          >
                            删除
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
                <div
                  className="transcription-layer-rail-resizer"
                  onPointerDown={handleLayerRailResizeStart}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="调整左侧层栏宽度"
                />
                <button
                  type="button"
                  className="transcription-layer-rail-toggle"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleLayerRailToggle}
                  aria-label={isLayerRailCollapsed ? '展开层栏' : '折叠层栏'}
                >
                  <span className="transcription-panel-toggle-icon" aria-hidden="true">
                    <span
                      className={`transcription-panel-toggle-triangle ${isLayerRailCollapsed ? 'transcription-panel-toggle-triangle-right' : 'transcription-panel-toggle-triangle-left'}`}
                    />
                  </span>
                </button>

                <div
                  className="timeline-scroll"
                  ref={tierContainerRef}
                  onPointerDown={handleLassoPointerDown}
                  onPointerMove={handleLassoPointerMove}
                  onPointerUp={handleLassoPointerUp}
                  onScroll={(e) => {
                    const ws = player.instanceRef.current;
                    if (ws) {
                      ws.setScroll(e.currentTarget.scrollLeft);
                    }
                  }}
                >
                  {selectedMediaUrl && player.isReady && player.duration > 0 ? (
                    <div className="timeline-content" style={{ width: player.duration * zoomPxPerSec }}>
                      {lassoRect && (
                        <div
                          className="timeline-lasso-rect"
                          style={{
                            left: lassoRect.x,
                            top: lassoRect.y,
                            width: lassoRect.w,
                            height: lassoRect.h,
                          }}
                        />
                      )}
                      {transcriptionLayers.map((layer) => (
                        <div key={`tl-${layer.id}`} className="timeline-lane">
                          <span className="timeline-lane-label">{(() => { const p = getLayerLabelParts(layer); return <>{p.type}<br />{p.lang}</>; })()}</span>
                          {timelineRenderUtterances.map((utt) => {
                            const isSelected = selectedUtteranceIds.has(utt.id);
                            const isActive = utt.id === selectedUtteranceId && layer.id === focusedLayerRowId;
                            const sourceText = getUtteranceTextForLayer(utt, layer.id);
                            const draftKey = `trc-${layer.id}-${utt.id}`;
                            const legacyDraft = layer.id === defaultTranscriptionLayerId ? utteranceDrafts[utt.id] : undefined;
                            const draft = utteranceDrafts[draftKey] ?? legacyDraft ?? sourceText;
                            const dpStart = dragPreview?.id === utt.id ? dragPreview.start : utt.startTime;
                            const dpEnd = dragPreview?.id === utt.id ? dragPreview.end : utt.endTime;
                            return (
                              <TimelineAnnotationItem
                                key={utt.id}
                                left={dpStart * zoomPxPerSec}
                                width={Math.max(4, (dpEnd - dpStart) * zoomPxPerSec)}
                                isSelected={isSelected}
                                isActive={isActive}
                                isCompact={(dpEnd - dpStart) * zoomPxPerSec < 36}
                                title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}`}
                                draft={draft}
                                onClick={(e) => handleAnnotationClick(utt.id, layer.id, e)}
                                onContextMenu={(e) => handleAnnotationContextMenu(utt.id, utt, layer.id, e)}
                                onDoubleClick={() => zoomToUtterance(utt.startTime, utt.endTime)}
                                onResizeStartPointerDown={(e) => startTimelineResizeDrag(e, utt, 'start', layer.id)}
                                onResizeEndPointerDown={(e) => startTimelineResizeDrag(e, utt, 'end', layer.id)}
                                onChange={(e) => {
                                  const value = normalizeSingleLine(e.target.value);
                                  setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: value }));
                                  if (value !== sourceText) {
                                    scheduleAutoSave(`utt-${layer.id}-${utt.id}`, async () => {
                                      await saveUtteranceText(utt.id, value, layer.id);
                                    });
                                  }
                                }}
                                onBlur={(e) => {
                                  const value = normalizeSingleLine(e.target.value);
                                  clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
                                  if (value !== sourceText) {
                                    fireAndForget(saveUtteranceText(utt.id, value, layer.id));
                                  }
                                }}
                                onKeyDown={handleAnnotationKeyDown}
                              />
                            );
                          })}
                        </div>
                      ))}
                      {translationLayers.map((layer) => (
                        <div key={`tl-${layer.id}`} className="timeline-lane timeline-lane-translation">
                          <span className="timeline-lane-label">{(() => { const p = getLayerLabelParts(layer); return <>{p.type}<br />{p.lang}</>; })()}</span>
                          {timelineRenderUtterances.map((utt) => {
                            const text = translationTextByLayer.get(layer.id)?.get(utt.id)?.text ?? '';
                            const draftKey = `${layer.id}-${utt.id}`;
                            const draft = translationDrafts[draftKey] ?? text;
                            const isSelected = selectedUtteranceIds.has(utt.id);
                            const isActive = utt.id === selectedUtteranceId && layer.id === focusedLayerRowId;
                            const dpStart = dragPreview?.id === utt.id ? dragPreview.start : utt.startTime;
                            const dpEnd = dragPreview?.id === utt.id ? dragPreview.end : utt.endTime;
                            return (
                              <TimelineAnnotationItem
                                key={utt.id}
                                left={dpStart * zoomPxPerSec}
                                width={Math.max(4, (dpEnd - dpStart) * zoomPxPerSec)}
                                isSelected={isSelected}
                                isActive={isActive}
                                isCompact={(dpEnd - dpStart) * zoomPxPerSec < 36}
                                title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}`}
                                draft={draft}
                                placeholder="翻译"
                                onClick={(e) => handleAnnotationClick(utt.id, layer.id, e)}
                                onContextMenu={(e) => handleAnnotationContextMenu(utt.id, utt, layer.id, e)}
                                onDoubleClick={() => zoomToUtterance(utt.startTime, utt.endTime)}
                                onResizeStartPointerDown={(e) => startTimelineResizeDrag(e, utt, 'start', layer.id)}
                                onResizeEndPointerDown={(e) => startTimelineResizeDrag(e, utt, 'end', layer.id)}
                                onFocus={() => {
                                  focusedTranslationDraftKeyRef.current = draftKey;
                                }}
                                onChange={(e) => {
                                  const value = normalizeSingleLine(e.target.value);
                                  setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                                  if (value.trim() && value !== text) {
                                    scheduleAutoSave(`tr-${layer.id}-${utt.id}`, async () => {
                                      await saveTextTranslationForUtterance(utt.id, value, layer.id);
                                    });
                                  } else {
                                    clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                                  }
                                }}
                                onBlur={(e) => {
                                  focusedTranslationDraftKeyRef.current = null;
                                  const value = normalizeSingleLine(e.target.value);
                                  clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                                  if (value !== text) {
                                    fireAndForget(saveTextTranslationForUtterance(utt.id, value, layer.id));
                                  }
                                }}
                                onKeyDown={handleAnnotationKeyDown}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="timeline-empty-state">
                      {layers.length === 0
                        ? '请先创建转写层或翻译层'
                        : utterancesOnCurrentMedia.length === 0 && selectedMediaUrl
                          ? '请在波形区拖拽选取或按 Enter 创建第一个句段'
                          : '请导入音频文件开始转写'}
                    </div>
                  )}
                </div>
              </div>
              {timelineResizeTooltip && (
                <div
                  className="timeline-resize-tooltip"
                  style={{ left: timelineResizeTooltip.x, top: timelineResizeTooltip.y - 16 }}
                >
                  {formatTime(timelineResizeTooltip.start)} - {formatTime(timelineResizeTooltip.end)}
                </div>
              )}
              <div className="transcription-list-toolbar transcription-list-toolbar-zoom-only">
                <div className="transcription-list-toolbar-left">
                  <div className="waveform-zoom-bar waveform-zoom-bar-bottom">
                    <button className="icon-btn" onClick={() => zoomToPercent(100, undefined, 'fit-all')} title="适应全部">
                      <Maximize2 size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        const sel = utterancesOnCurrentMedia.find((u) => u.id === selectedUtteranceId);
                        if (sel) zoomToUtterance(sel.startTime, sel.endTime);
                      }}
                      title="适应选区"
                      disabled={!selectedUtteranceId}
                    >
                      <Focus size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => zoomToPercent(Math.round((100 / fitPxPerSec) * 100), undefined, 'custom')}
                      title="1:1 (100px/s)"
                    >
                      <span style={{ fontSize: 11, fontWeight: 600 }}>1:1</span>
                    </button>
                    <span style={{ width: 1, height: 14, background: '#d1d5db', margin: '0 2px' }} />
                    <button
                      className={`icon-btn${snapEnabled ? ' icon-btn-active' : ''}`}
                      onClick={() => setSnapEnabled((v) => !v)}
                      title={snapEnabled ? '过零点吸附：开' : '过零点吸附：关'}
                    >
                      <span style={{ fontSize: 10, fontWeight: 600 }}>ZC</span>
                    </button>
                    <span style={{ width: 1, height: 14, background: '#d1d5db', margin: '0 2px' }} />
                    <input
                      type="range"
                      className="waveform-zoom-slider"
                      min={0}
                      max={1000}
                      step={1}
                      value={Math.round(Math.log(zoomPercent / 100) / Math.log(maxZoomPercent / 100) * 1000)}
                      onChange={(e) => {
                        const pos = Number(e.target.value);
                        const pct = 100 * Math.pow(maxZoomPercent / 100, pos / 1000);
                        zoomToPercent(pct, undefined, 'custom');
                      }}
                      title={`缩放：${zoomPercent}%`}
                    />
                    <span className="waveform-zoom-value">{zoomPercent}%</span>
                  </div>
                </div>
                <div className="transcription-list-toolbar-right">
                  {canUndo && undoLabel && (
                    <>
                      <button
                        type="button"
                        className="transcription-undo-chip"
                        title={`下一次撤销: ${undoLabel}`}
                        onClick={() => setShowUndoHistory((v) => !v)}
                      >
                        <Undo2 size={13} />
                        <span className="transcription-undo-chip-label">撤销: {undoLabel}</span>
                      </button>
                      {showUndoHistory && (
                        <div className="transcription-undo-history">
                          <div className="transcription-undo-history-title">撤销历史（最近 15 条）</div>
                          {undoHistory.map((label, idx) => (
                            <button
                              key={`${label}-${idx}`}
                              type="button"
                              className="transcription-undo-history-item"
                              onClick={() => {
                                fireAndForget(undoToHistoryIndex(idx));
                                setShowUndoHistory(false);
                              }}
                              title={`回退到这一步：${label}`}
                            >
                              {idx + 1}. {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

            <div
              className="transcription-ai-panel-resizer"
              onPointerDown={handleAiPanelResizeStart}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整 AI 面板宽度"
            />
            <button
              type="button"
              className="transcription-ai-panel-toggle"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleAiPanelToggle}
              aria-label={isAiPanelCollapsed ? '展开 AI 面板' : '折叠 AI 面板'}
            >
              <span className="transcription-panel-toggle-icon" aria-hidden="true">
                <span
                  className={`transcription-panel-toggle-triangle ${isAiPanelCollapsed ? 'transcription-panel-toggle-triangle-left' : 'transcription-panel-toggle-triangle-right'}`}
                />
              </span>
            </button>

            <AiAnalysisPanel
              isCollapsed={isAiPanelCollapsed}
              dbName={state.dbName}
              utteranceCount={state.utteranceCount}
              translationLayerCount={state.translationLayerCount}
              aiConfidenceAvg={aiConfidenceAvg}
              selectedUtterance={selectedUtterance ?? null}
              selectedRowMeta={selectedRowMeta}
              selectedAiWarning={selectedAiWarning}
              lexemeMatches={lexemeMatches}
            />
          </main>

          <div className="transcription-toast-container">
            {saveState.kind === 'saving' && <div className="transcription-toast transcription-toast-info">正在保存内容...</div>}
            {saveState.kind === 'done' && <div className="transcription-toast transcription-toast-success">{saveState.message}</div>}
            {saveState.kind === 'error' && <div className="transcription-toast transcription-toast-error">{saveState.message}</div>}
            {recording && (
              <div className="transcription-toast transcription-toast-recording">正在录音：{recordingUtteranceId ?? '未知行'}（点击语段内麦克风图标结束并保存）</div>
            )}
            {recordingError && <div className="transcription-toast transcription-toast-error">{recordingError}</div>}
          </div>

          <ProjectSetupDialog
            isOpen={showProjectSetup}
            onClose={() => setShowProjectSetup(false)}
            onSubmit={async (input) => {
              const result = await LinguisticService.createProject(input);
              setActiveTextId(result.textId);
              setSaveState({ kind: 'done', message: `项目「${input.titleZh}」创建成功，请导入音频。` });
              setShowAudioImport(true);
              await loadSnapshot();
            }}
          />

          <AudioImportDialog
            isOpen={showAudioImport}
            onClose={() => setShowAudioImport(false)}
            onImport={async (file, duration) => {
              const textId = activeTextId ?? (await getActiveTextId());
              if (!textId) {
                throw new Error('请先创建项目，再导入音频。');
              }
              const blob = new Blob([await file.arrayBuffer()], { type: file.type });
              const { mediaId } = await LinguisticService.importAudio({
                textId,
                audioBlob: blob,
                filename: file.name,
                duration,
              });
              addMediaItem({
                id: mediaId,
                textId,
                filename: file.name,
                duration,
                details: { audioBlob: blob },
                isOfflineCached: true,
                createdAt: new Date().toISOString(),
              } as import('../../db').MediaItemDocType);
              setSaveState({ kind: 'done', message: `音频「${file.name}」导入成功。` });
            }}
          />
        </>
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={(() => {
            const id = ctxMenu.utteranceId;
            const multiCount = selectedUtteranceIds.size;
            const items: ContextMenuItem[] = multiCount > 1
              ? [
                  { label: `删除 ${multiCount} 个句段`, shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUtteranceIds); } },
                  { label: `合并 ${multiCount} 个句段`, onClick: () => { runMergeSelection(selectedUtteranceIds); } },
                  { label: '选中此句段及之前所有', shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
                  { label: '选中此句段及之后所有', shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
                ]
              : [
              { label: '删除句段', shortcut: '⌫', danger: true, onClick: () => { runDeleteOne(id); } },
              { label: '向前合并', shortcut: '⌘⇧M', onClick: () => { runMergePrev(id); } },
              { label: '向后合并', shortcut: '⌘M', onClick: () => { runMergeNext(id); } },
              {
                label: '从当前位置拆分句段',
                shortcut: '⌘⇧S',
                onClick: () => { runSplitAtTime(id, ctxMenu.splitTime); },
              },
              { label: '选中此句段及之前所有', shortcut: '⇧Home', onClick: () => { runSelectBefore(id); } },
              { label: '选中此句段及之后所有', shortcut: '⇧End', onClick: () => { runSelectAfter(id); } },
            ];
            return items;
          })()}
        />
      )}
      {uttOpsMenu && selectedUtteranceId && (
        <ContextMenu
          x={uttOpsMenu.x}
          y={uttOpsMenu.y}
          onClose={() => setUttOpsMenu(null)}
          items={(() => {
            const id = selectedUtteranceId;
            const multiCount = selectedUtteranceIds.size;
            if (multiCount > 1) {
              return [
                { label: `删除 ${multiCount} 个句段`, shortcut: '⌫', danger: true, onClick: () => { runDeleteSelection(id, selectedUtteranceIds); } },
                { label: `合并 ${multiCount} 个句段`, onClick: () => { runMergeSelection(selectedUtteranceIds); } },
              ];
            }
            return [
              { label: '删除句段', shortcut: '⌫', danger: true, onClick: () => { runDeleteOne(id); } },
              { label: '向前合并', shortcut: '⌘⇧M', onClick: () => { runMergePrev(id); } },
              { label: '向后合并', shortcut: '⌘M', onClick: () => { runMergeNext(id); } },
              { label: '拆分句段', shortcut: '⌘⇧S', onClick: () => { const ws = player.instanceRef.current; if (ws) runSplitAtTime(id, ws.getCurrentTime()); } },
            ];
          })()}
        />
      )}
      <ConfirmDeleteDialog
        open={Boolean(deleteConfirmState)}
        totalCount={deleteConfirmState?.totalCount ?? 0}
        textCount={deleteConfirmState?.textCount ?? 0}
        emptyCount={deleteConfirmState?.emptyCount ?? 0}
        muteInSession={muteDeleteConfirmInSession}
        onMuteChange={setMuteDeleteConfirmInSession}
        onCancel={closeDeleteConfirmDialog}
        onConfirm={confirmDeleteFromDialog}
      />
    </section>
  );
}
