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
import { LinguisticService } from '../../services/LinguisticService';
import { getDb } from '../../db';
import { exportToEaf, importFromEaf, downloadEaf, readFileAsText } from '../../services/EafService';
import { snapToZeroCrossing } from '../services/AudioAnalysisService';
import { getEffectiveKeymap, matchKeyEvent, DEFAULT_KEYBINDINGS } from '../services/KeybindingService';
import { exportToTextGrid, importFromTextGrid, downloadTextGrid } from '../../services/TextGridService';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useDeleteConfirmFlow } from '../hooks/useDeleteConfirmFlow';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import {
  COMMON_LANGUAGES,
  formatTime,
  formatLayerRailLabel,
  getLayerLabelParts,
  normalizeSingleLine,
  newId,
} from '../utils/transcriptionFormatters';
import { computeLassoOutcome } from '../utils/waveformSelectionUtils';
import { resolveDeletePlan } from '../utils/deleteSelectionUtils';

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
    snapGuide,
    setSnapGuide,
    translationLayers,
    transcriptionLayers,
    layerRailRows,
    deletableLayers,
    selectedUtterance,
    selectedUtteranceMedia,
    selectedMediaUrl,
    utterancesOnCurrentMedia,
    aiConfidenceAvg,
    translationTextByLayer,
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
    void checkRecovery().then((snap) => {
      if (cancelled || !snap) return;
      recoveryDataRef.current = snap;
      setRecoveryDiffSummary({
        utterances: Math.max(0, snap.utterances.length - utterances.length),
        translations: Math.max(0, snap.translations.length - translations.length),
        layers: Math.max(0, snap.layers.length - layers.length),
      });
      setRecoveryAvailable(true);
    });
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
  const [loopPlayback, setLoopPlayback] = useState(false);
  const waveformAreaRef = useRef<HTMLDivElement | null>(null);

  const utteranceRowRef = useRef<Record<string, HTMLDivElement | null>>({});
  const waveCanvasRef = useRef<HTMLDivElement | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [rulerView, setRulerView] = useState<{ start: number; end: number } | null>(null);
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

  // ---- Drag-select (lasso) on timeline ----
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [waveLassoRect, setWaveLassoRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    mode: 'select' | 'create';
    hitCount: number;
  } | null>(null);
  const [waveLassoHintCount, setWaveLassoHintCount] = useState(0);
  const [timelineResizeTooltip, setTimelineResizeTooltip] = useState<{
    x: number;
    y: number;
    start: number;
    end: number;
  } | null>(null);
  const waveLassoHintCountRef = useRef(0);
  const waveLassoHintTimerRef = useRef<number | undefined>(undefined);
  // ---- Alt+drag sub-selection inside regions ----
  const [subSelectionRange, setSubSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const subSelectDragRef = useRef<{
    active: boolean;
    regionId: string;
    anchorTime: number;
    pointerId: number;
  } | null>(null);
  const subSelectPreviewRef = useRef<HTMLDivElement | null>(null);
  const lassoRef = useRef<{
    active: boolean;
    anchorX: number; anchorY: number; // client coords at pointerdown
    scrollLeft0: number; // scrollLeft of tierContainer at pointerdown
    baseIds: Set<string>; // ids already selected (additive with Shift/Ctrl)
    hitCount: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const waveLassoRef = useRef<{
    active: boolean;
    anchorX: number; anchorY: number;
    scrollLeft0: number;
    baseIds: Set<string>;
    pointerId: number;
    hitCount: number;
    rangeStart: number;
    rangeEnd: number;
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
  const pendingLassoSelectionRef = useRef<{ ids: Set<string>; primaryId: string } | null>(null);
  const lassoSelectionRafRef = useRef<number | null>(null);

  const scheduleLassoSelectionUpdate = useCallback((ids: Set<string>, primaryId: string) => {
    pendingLassoSelectionRef.current = { ids, primaryId };
    if (lassoSelectionRafRef.current !== null) return;
    lassoSelectionRafRef.current = requestAnimationFrame(() => {
      lassoSelectionRafRef.current = null;
      const pending = pendingLassoSelectionRef.current;
      pendingLassoSelectionRef.current = null;
      if (!pending) return;
      setUtteranceSelection(pending.primaryId, pending.ids);
    });
  }, [setUtteranceSelection]);

  /** Check if an utterance has any text content (transcription or translations). */
  const utteranceHasText = useCallback((uttId: string): boolean => {
    const utt = utterances.find((u) => u.id === uttId);
    if (utt) {
      const values = Object.values(utt.transcription ?? {});
      if (values.some((v) => typeof v === 'string' && v.trim())) return true;
    }
    for (const [, layerMap] of translationTextByLayer) {
      const t = layerMap.get(uttId);
      if (t?.text?.trim()) return true;
    }
    return false;
  }, [utterances, translationTextByLayer]);

  const {
    requestDeleteUtterances,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useDeleteConfirmFlow(utteranceHasText);

  const runDeleteSelection = useCallback((primaryId: string, ids: Set<string>) => {
    const plan = resolveDeletePlan(primaryId, ids);
    if (plan.kind === 'none') return;
    if (plan.kind === 'multi') {
      requestDeleteUtterances(plan.ids, () => { void deleteSelectedUtterances(plan.ids); });
      return;
    }
    requestDeleteUtterances(plan.id, () => { void deleteUtterance(plan.id); });
  }, [requestDeleteUtterances, deleteSelectedUtterances, deleteUtterance]);

  const runDeleteOne = useCallback((id: string) => {
    runDeleteSelection(id, new Set([id]));
  }, [runDeleteSelection]);

  const runMergeSelection = useCallback((ids: Set<string>) => {
    if (ids.size <= 1) return;
    void mergeSelectedUtterances(ids);
  }, [mergeSelectedUtterances]);

  const runMergePrev = useCallback((id: string) => {
    if (!id) return;
    void mergeWithPrevious(id);
  }, [mergeWithPrevious]);

  const runMergeNext = useCallback((id: string) => {
    if (!id) return;
    void mergeWithNext(id);
  }, [mergeWithNext]);

  const runSplitAtTime = useCallback((id: string, splitTime: number) => {
    if (!id) return;
    void splitUtterance(id, splitTime);
  }, [splitUtterance]);

  const runSelectBefore = useCallback((id: string) => {
    if (!id) return;
    selectAllBefore(id);
  }, [selectAllBefore]);

  const runSelectAfter = useCallback((id: string) => {
    if (!id) return;
    selectAllAfter(id);
  }, [selectAllAfter]);

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
  const utterancesOnCurrentMediaRef = useRef(utterancesOnCurrentMedia);
  utterancesOnCurrentMediaRef.current = utterancesOnCurrentMedia;
  const selectedUtteranceIdsRef = useRef(selectedUtteranceIds);
  selectedUtteranceIdsRef.current = selectedUtteranceIds;
  const selectedUtteranceIdRef = useRef(selectedUtteranceId);
  selectedUtteranceIdRef.current = selectedUtteranceId;
  const safeDur = lastDurationRef.current;
  const fitPxPerSec = safeDur > 0 ? containerWidth / safeDur : 40;
  const zoomPxPerSec = fitPxPerSec * (zoomPercent / 100);
  zoomPxPerSecRef.current = zoomPxPerSec;
  const maxZoomPercent = Math.max(200, Math.ceil((2000 / fitPxPerSec) * 100));

  const player = useWaveSurfer({
    mediaUrl: selectedMediaUrl,
    regions: waveformRegions,
    activeRegionIds: selectedUtteranceIds,
    primaryRegionId: selectedUtteranceId,
    waveformFocused,
    loop: loopPlayback,
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
    onRegionClick: (regionId, _start, event) => {
      setSubSelectionRange(null);
      manualSelectTsRef.current = Date.now();
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
      void saveUtteranceTiming(regionId, finalStart, finalEnd);
    },
    onRegionCreate: (start, end) => {
      void createUtteranceFromSelection(start, end);
    },
    onRegionContextMenu: (regionId, x, y) => {
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

  // ---- 缩放（锚点保持）—— 接受百分比 ----
  const zoomToPercent = useCallback((newPercent: number, anchorFraction?: number) => {
    const ws = player.instanceRef.current;
    if (!ws) return;
    const clamped = Math.max(100, Math.min(maxZoomPercent, Math.round(newPercent)));
    const newPxPerSec = Math.max(1, fitPxPerSec * (clamped / 100));
    const frac = anchorFraction ?? 0.5;
    const scrollLeft = ws.getScroll();
    const width = ws.getWidth();
    const anchorTime = (scrollLeft + width * frac) / zoomPxPerSec;
    setZoomPercent(clamped);
    requestAnimationFrame(() => {
      const ws2 = player.instanceRef.current;
      if (!ws2) return;
      const target = anchorTime * newPxPerSec - width * frac;
      ws2.setScroll(target);
      if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
    });
  }, [zoomPxPerSec, fitPxPerSec, maxZoomPercent, player.instanceRef]);

  // ---- 双击句段：缩放并居中 ----
  const zoomToUtterance = useCallback((startTime: number, endTime: number) => {
    const ws = player.instanceRef.current;
    if (!ws) return;
    const uttDur = endTime - startTime;
    if (uttDur <= 0) return;
    const width = ws.getWidth();
    // 让句段占据视口 70%
    const targetPxPerSec = (width * 0.7) / uttDur;
    const targetPercent = Math.round((targetPxPerSec / fitPxPerSec) * 100);
    const clamped = Math.max(100, Math.min(maxZoomPercent, targetPercent));
    const newPxPerSec = Math.max(1, fitPxPerSec * (clamped / 100));
    const midTime = (startTime + endTime) / 2;
    const scrollTarget = Math.max(0, midTime * newPxPerSec - width / 2);
    const applyScroll = () => {
      ws.setScroll(scrollTarget);
      if (tierContainerRef.current) tierContainerRef.current.scrollLeft = scrollTarget;
    };
    if (clamped === zoomPercent) {
      applyScroll();
    } else {
      // 在 React effect 生命周期之外监听：ws.zoom() 同步触发 'zoom'，
      // 确保在 renderer.reRender() 调整滚动位置之后覆盖为居中位置
      ws.once('zoom', applyScroll);
      setZoomPercent(clamped);
    }
  }, [fitPxPerSec, maxZoomPercent, zoomPercent, player.instanceRef]);

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
      void saveUtteranceTiming(drag.utteranceId, finalStart, finalEnd);
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

  // ---- Waveform pointer interactions ----
  // Default drag on region = sub-range selection; Alt+drag = move/resize region.
  // Drag on empty area: if hits regions => select; if hits none => create a new segment.
  useEffect(() => {
    const el = waveCanvasRef.current;
    if (!el) return;

    const getScrollContainer = () => {
      const ws = player.instanceRef.current;
      return (ws?.getWrapper()?.parentElement ?? null) as HTMLElement | null;
    };

    const hitTestExistingAtClientX = (clientX: number) => {
      const sc = getScrollContainer();
      const rect = el.getBoundingClientRect();
      const contentX = clientX - rect.left + (sc?.scrollLeft ?? 0);
      if (zoomPxPerSecRef.current <= 0) return false;
      const time = contentX / zoomPxPerSecRef.current;
      // Clamp tolerance to avoid over-capturing at low zoom levels.
      const eps = Math.min(0.03, Math.max(0.005, 3 / zoomPxPerSecRef.current));
      return utterancesOnCurrentMediaRef.current.some(
        (u) => u.startTime - eps <= time && u.endTime + eps >= time,
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      // ---- Sub-selection drag is starting via onRegionAltPointerDown callback ----
      // If sub-select drag ref is set, skip lasso logic (pointermove will handle it)
      if (subSelectDragRef.current) return;

      // Ignore interactive controls in waveform overlay.
      const onControl = e.composedPath().some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest('button, input, textarea, select, a, [role="button"]')) return true;
        return node.classList.contains('region-action-overlay') || node.classList.contains('region-action-btn');
      });
      if (onControl) return;

      // Robust hit-test: if pointer time is inside any existing utterance, don't
      // start empty-area lasso; let region click/selection logic handle it.
      const sc = getScrollContainer();
      const hitExisting = hitTestExistingAtClientX(e.clientX);
      if (hitExisting) return;

      // Any click on empty area clears the sub-selection
      setSubSelectionRange(null);

      // ---- Unified drag on empty area ----
      e.stopPropagation();
      e.preventDefault();

      const scForDrag = sc ?? getScrollContainer();
      // Shift-drag = additive lasso; Cmd/Ctrl-drag = replace by lasso only.
      const baseIds = e.shiftKey
        ? new Set(selectedUtteranceIdsRef.current)
        : new Set<string>();
      waveLassoRef.current = {
        active: false,
        anchorX: e.clientX,
        anchorY: e.clientY,
        scrollLeft0: scForDrag?.scrollLeft ?? 0,
        baseIds,
        pointerId: e.pointerId,
        hitCount: 0,
        rangeStart: 0,
        rangeEnd: 0,
      };
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      // --- Sub-selection drag ---
      const sub = subSelectDragRef.current;
      if (sub) {
        const ws = player.instanceRef.current;
        const wrapper = ws?.getWrapper();
        const sc = wrapper?.parentElement;
        if (!sc || !wrapper) return;
        const rect = sc.getBoundingClientRect();
        const pxOffset = e.clientX - rect.left + sc.scrollLeft;
        const totalWidth = wrapper.scrollWidth;
        const dur = player.duration || 1;
        const currentTime = Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
        const dragStart = Math.min(sub.anchorTime, currentTime);
        const dragEnd = Math.max(sub.anchorTime, currentTime);
        if (!sub.active && Math.abs(currentTime - sub.anchorTime) < 0.01) return;
        sub.active = true;

        // Direct DOM preview for responsiveness
        if (!subSelectPreviewRef.current) {
          const div = document.createElement('div');
          div.style.position = 'absolute';
          div.style.top = '0';
          div.style.height = '100%';
          div.style.backgroundColor = 'rgba(34, 197, 94, 0.30)';
          div.style.pointerEvents = 'none';
          div.style.zIndex = '5';
          sc.style.position = 'relative';
          sc.appendChild(div);
          subSelectPreviewRef.current = div;
        }
        const leftPx = dragStart * (totalWidth / dur);
        const widthPx = (dragEnd - dragStart) * (totalWidth / dur);
        subSelectPreviewRef.current.style.left = `${leftPx}px`;
        subSelectPreviewRef.current.style.width = `${widthPx}px`;
        return;
      }

      // --- Lasso multi-select drag ---
      const info = waveLassoRef.current;
      if (!info) return;
      const dx = e.clientX - info.anchorX;
      const dy = e.clientY - info.anchorY;
      if (!info.active && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      info.active = true;

      const rect = el.getBoundingClientRect();
      const sc = getScrollContainer();
      const scrollLeft = sc?.scrollLeft ?? 0;

      const toX = (cx: number) => cx - rect.left;
      const toY = (cy: number) => cy - rect.top;

      const ax = toX(info.anchorX);
      const ay = toY(info.anchorY);
      const cx = toX(e.clientX);
      const cy = toY(e.clientY);

      const left = Math.max(0, Math.min(ax, cx));
      const top = Math.max(0, Math.min(ay, cy));
      const width = Math.abs(cx - ax);
      const height = Math.abs(cy - ay);

      const contentAx = ax + scrollLeft;
      const contentCx = cx + scrollLeft;
      const contentLeft = Math.min(contentAx, contentCx);
      const contentRight = Math.max(contentAx, contentCx);

      if (zoomPxPerSecRef.current > 0) {
        const tStart = contentLeft / zoomPxPerSecRef.current;
        const tEnd = contentRight / zoomPxPerSecRef.current;
        const outcome = computeLassoOutcome(
          utterancesOnCurrentMediaRef.current,
          tStart,
          tEnd,
          info.baseIds,
        );
        if (outcome.mode === 'select' && outcome.hitCount !== waveLassoHintCountRef.current) {
          if (waveLassoHintTimerRef.current !== undefined) {
            window.clearTimeout(waveLassoHintTimerRef.current);
          }
          waveLassoHintTimerRef.current = window.setTimeout(() => {
            waveLassoHintTimerRef.current = undefined;
            waveLassoHintCountRef.current = outcome.hitCount;
            setWaveLassoHintCount(outcome.hitCount);
          }, 90);
        }
        if (outcome.mode === 'create' && waveLassoHintCountRef.current !== 0) {
          waveLassoHintCountRef.current = 0;
          setWaveLassoHintCount(0);
        }
        setWaveLassoRect({
          x: left,
          y: outcome.mode === 'create' ? 0 : top,
          w: width,
          h: outcome.mode === 'create' ? el.clientHeight : height,
          mode: outcome.mode,
          hitCount: outcome.hitCount,
        });
        info.hitCount = outcome.hitCount;
        info.rangeStart = tStart;
        info.rangeEnd = tEnd;
        if (outcome.primaryId) skipSeekForIdRef.current = outcome.primaryId;
        scheduleLassoSelectionUpdate(outcome.ids, outcome.primaryId);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      // --- Sub-selection finish ---
      const sub = subSelectDragRef.current;
      if (sub) {
        subSelectDragRef.current = null;
        // Remove direct DOM preview
        if (subSelectPreviewRef.current) {
          subSelectPreviewRef.current.remove();
          subSelectPreviewRef.current = null;
        }
        if (sub.active) {
          // Compute final range
          const ws = player.instanceRef.current;
          const wrapper = ws?.getWrapper();
          const sc = wrapper?.parentElement;
          if (sc && wrapper) {
            const rectSc = sc.getBoundingClientRect();
            const pxOffset = e.clientX - rectSc.left + sc.scrollLeft;
            const totalWidth = wrapper.scrollWidth;
            const dur = player.duration || 1;
            const currentTime = Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
            const s = Math.min(sub.anchorTime, currentTime);
            const end = Math.max(sub.anchorTime, currentTime);
            if (end - s >= 0.02) {
              setSubSelectionRange({ start: s, end });
            }
          }
        }
        return;
      }

      // --- Lasso finish ---
      const info = waveLassoRef.current;
      waveLassoRef.current = null;
      setWaveLassoRect(null);
      if (waveLassoHintTimerRef.current !== undefined) {
        window.clearTimeout(waveLassoHintTimerRef.current);
        waveLassoHintTimerRef.current = undefined;
      }
      waveLassoHintCountRef.current = 0;
      setWaveLassoHintCount(0);
      if (info && !info.active) {
        // Only clear when pointerup is still on empty area; don't clear if the
        // click actually landed on an existing segment.
        if (!hitTestExistingAtClientX(e.clientX)) {
          clearUtteranceSelection();
          // Click-to-seek: move playback position to the clicked time
          const sc = getScrollContainer();
          if (sc && zoomPxPerSecRef.current > 0) {
            const rect = el.getBoundingClientRect();
            const contentX = e.clientX - rect.left + (sc.scrollLeft ?? 0);
            const clickTime = contentX / zoomPxPerSecRef.current;
            player.seekTo(clickTime);
          }
        }
      } else if (info && info.active) {
        const s = Math.min(info.rangeStart, info.rangeEnd);
        const end = Math.max(info.rangeStart, info.rangeEnd);
        if (info.hitCount === 0 && end - s >= 0.05) {
          void createUtteranceFromSelection(s, end);
        }
      }
    };

    el.addEventListener('pointerdown', onPointerDown, { capture: true });
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown, { capture: true });
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      if (subSelectPreviewRef.current) {
        subSelectPreviewRef.current.remove();
        subSelectPreviewRef.current = null;
      }
    };
  }, [selectedMediaUrl, player.isReady, clearUtteranceSelection, selectUtterance, selectUtteranceRange, toggleUtteranceSelection, createUtteranceFromSelection, scheduleLassoSelectionUpdate, setSelectedUtteranceId]);

  useEffect(() => () => {
    if (lassoSelectionRafRef.current !== null) {
      cancelAnimationFrame(lassoSelectionRafRef.current);
      lassoSelectionRafRef.current = null;
    }
    if (waveLassoHintTimerRef.current !== undefined) {
      window.clearTimeout(waveLassoHintTimerRef.current);
      waveLassoHintTimerRef.current = undefined;
    }
  }, []);

  // ---- Lasso drag-select on timeline ----
  const handleLassoPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only start lasso from empty area (not from annotations, labels, inputs)
    const target = e.target as Element;
    if (
      target.closest('.timeline-annotation') ||
      target.closest('.timeline-annotation-input') ||
      target.closest('.timeline-lane-label') ||
      target.closest('input, textarea, select, button, a, [role="button"]')
    ) return;
    // Only primary button
    if (e.button !== 0) return;

    const container = tierContainerRef.current;
    if (!container) return;

    // Shift-drag = additive lasso; Cmd/Ctrl-drag = replace by lasso only.
    const baseIds = e.shiftKey ? new Set(selectedUtteranceIds) : new Set<string>();

    lassoRef.current = {
      active: false,
      anchorX: e.clientX,
      anchorY: e.clientY,
      scrollLeft0: container.scrollLeft,
      baseIds,
      hitCount: 0,
      rangeStart: 0,
      rangeEnd: 0,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }, [selectedUtteranceIds]);

  const handleLassoPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const info = lassoRef.current;
    if (!info) return;

    const dx = e.clientX - info.anchorX;
    const dy = e.clientY - info.anchorY;
    // Only activate after 4px to avoid accidental lasso on click
    if (!info.active && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    info.active = true;

    const container = tierContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // Convert to coords relative to timeline-content (accounting for scroll)
    const toContentX = (clientX: number) => clientX - rect.left + container.scrollLeft;
    const toContentY = (clientY: number) => clientY - rect.top + container.scrollTop;

    const ax = toContentX(info.anchorX) - (container.scrollLeft - info.scrollLeft0);
    const ay = toContentY(info.anchorY);
    const cx = toContentX(e.clientX);
    const cy = toContentY(e.clientY);

    const left = Math.min(ax, cx);
    const top = Math.min(ay, cy);
    const width = Math.abs(cx - ax);
    const height = Math.abs(cy - ay);

    setLassoRect({ x: left, y: top, w: width, h: height });

    // Compute time range from horizontal pixel range
    if (zoomPxPerSec > 0) {
      const tStart = left / zoomPxPerSec;
      const tEnd = (left + width) / zoomPxPerSec;
      const outcome = computeLassoOutcome(
        utterancesOnCurrentMedia,
        tStart,
        tEnd,
        info.baseIds,
        true,
      );
      info.hitCount = outcome.hitCount;
      info.rangeStart = tStart;
      info.rangeEnd = tEnd;
      if (outcome.primaryId) {
        skipSeekForIdRef.current = outcome.primaryId;
      }
      scheduleLassoSelectionUpdate(outcome.ids, outcome.primaryId);
    }
  }, [zoomPxPerSec, utterancesOnCurrentMedia, scheduleLassoSelectionUpdate]);

  const handleLassoPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const info = lassoRef.current;
    lassoRef.current = null;
    setLassoRect(null);

    if (info && !info.active) {
      // It was a plain click on empty area — clear selection
      const target = e.target as Element;
      if (
        !target.closest('.timeline-annotation') &&
        !target.closest('.timeline-lane-label') &&
        !target.closest('input, textarea, select, button')
      ) {
        if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
          clearUtteranceSelection();
        }
      }
    } else if (info && info.active) {
      const s = Math.min(info.rangeStart, info.rangeEnd);
      const end = Math.max(info.rangeStart, info.rangeEnd);
      if (info.hitCount === 0 && end - s >= 0.05) {
        void createUtteranceFromSelection(s, end);
      }
    }
  }, [clearUtteranceSelection, createUtteranceFromSelection]);

  // ---- WaveSurfer scroll/zoom → 同步刻度尺 ----
  useEffect(() => {
    const ws = player.instanceRef.current;
    if (!ws || !player.isReady) return;
    const dur = player.duration || 0;

    const syncFromDom = () => {
      if (dur <= 0 || zoomPxPerSec <= 0) return;
      const scrollLeft = ws.getScroll();
      const clientWidth = ws.getWidth();
      const totalWidth = Math.max(clientWidth, Math.ceil(dur * zoomPxPerSec));
      setRulerView({
        start: (scrollLeft / totalWidth) * dur,
        end: Math.min(dur, ((scrollLeft + clientWidth) / totalWidth) * dur),
      });
      if (tierContainerRef.current) tierContainerRef.current.scrollLeft = scrollLeft;
    };

    const unsubScroll = ws.on('scroll', (startTime: number, endTime: number) => {
      setRulerView({ start: startTime, end: endTime });
      if (tierContainerRef.current) tierContainerRef.current.scrollLeft = ws.getScroll();
    });
    // zoom 后 scroll 事件不一定触发（scrollLeft 未变时），需主动同步
    const unsubZoom = ws.on('zoom', () => {
      requestAnimationFrame(syncFromDom);
    });

    syncFromDom(); // 初始同步
    return () => { unsubScroll(); unsubZoom(); };
  }, [zoomPxPerSec, selectedMediaUrl, player.isReady, player.duration, player.instanceRef]);

  // ---- Wheel 拦截：Ctrl/⌘+滚轮缩放，普通滚轮平移 ----
  useEffect(() => {
    const el = waveCanvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const ws = player.instanceRef.current;
      if (!ws) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        // 对数感觉：每次滚轮 ×1.15 或 ÷1.15
        const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
        zoomToPercent(zoomPercent * factor, frac);
      } else {
        e.preventDefault();
        const target = ws.getScroll() + e.deltaY + e.deltaX;
        ws.setScroll(target);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomPercent, zoomToPercent, selectedMediaUrl, player.isReady, player.instanceRef]);

  // ---- Wheel 拦截（tier lanes）：与波形同步 ----
  useEffect(() => {
    const el = tierContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const ws = player.instanceRef.current;
      if (!ws) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
        zoomToPercent(zoomPercent * factor, frac);
      } else {
        e.preventDefault();
        const target = ws.getScroll() + e.deltaY + e.deltaX;
        ws.setScroll(target);
        if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomPercent, zoomToPercent, selectedMediaUrl, player.isReady, player.instanceRef]);

  // ---- 播放时视口自动跟随 ----
  useEffect(() => {
    if (!player.isPlaying) return;
    const ws = player.instanceRef.current;
    if (!ws) return;
    const scrollLeft = ws.getScroll();
    const width = ws.getWidth();
    const rightEdge = (scrollLeft + width * 0.85) / zoomPxPerSec;
    if (player.currentTime > rightEdge) {
      const target = player.currentTime * zoomPxPerSec - width * 0.15;
      ws.setScroll(target);
      if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
    }
  }, [player.currentTime, player.isPlaying, zoomPxPerSec, player.instanceRef]);

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

  // Clear sub-selection when the selected utterance changes
  useEffect(() => {
    setSubSelectionRange(null);
  }, [selectedUtteranceId]);

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

  // ---- Keybinding system ----
  const keymap = useMemo(() => getEffectiveKeymap(), []);

  // Action dispatch table — maps action IDs to handler functions
  const waveformActionsRef = useRef<Record<string, (e: KeyboardEvent | React.KeyboardEvent) => void>>({});
  waveformActionsRef.current = {
    playPause: () => {
      if (!player.isReady) return;
      if (player.isPlaying) {
        player.stop();
      } else if (subSelectionRange) {
        player.playRegion(subSelectionRange.start, subSelectionRange.end, true);
      } else if (selectedUtterance) {
        player.playRegion(selectedUtterance.startTime, selectedUtterance.endTime, true);
      } else {
        player.togglePlayback();
      }
    },
    markSegment: () => {
      const ws = player.instanceRef.current;
      if (!ws || !player.isReady || !selectedMediaUrl) return;
      const now = ws.getCurrentTime();
      if (segMarkStart === null) {
        markingModeRef.current = true;
        setSegMarkStart(now);
        if (!player.isPlaying) player.togglePlayback();
      } else {
        const s = Math.min(segMarkStart, now);
        const end = Math.max(segMarkStart, now);
        if (end - s >= 0.05) {
          skipSeekForIdRef.current = '__next_created__';
          creatingSegmentRef.current = true;
          void createUtteranceFromSelection(s, end).then(() => {
            if (markingModeRef.current) setSelectedUtteranceId('');
          }).finally(() => { creatingSegmentRef.current = false; });
        }
        setSegMarkStart(null);
      }
    },
    cancel: () => {
      if (subSelectionRange) { setSubSelectionRange(null); return; }
      markingModeRef.current = false;
      if (segMarkStart !== null) {
        setSegMarkStart(null);
        if (player.isPlaying) player.togglePlayback();
      }
    },
    deleteSegment: () => {
      runDeleteSelection(selectedUtteranceId, selectedUtteranceIds);
    },
    mergePrev: () => { runMergePrev(selectedUtteranceId); },
    mergeNext: () => { runMergeNext(selectedUtteranceId); },
    splitSegment: () => {
      if (!selectedUtteranceId) return;
      const ws = player.instanceRef.current;
      if (ws) runSplitAtTime(selectedUtteranceId, ws.getCurrentTime());
    },
    selectBefore: () => { runSelectBefore(selectedUtteranceId); },
    selectAfter:  () => { runSelectAfter(selectedUtteranceId); },
    selectAll:    () => { selectAllUtterances(); },
    navPrev: (e) => {
      if (!selectedUtteranceId) return;
      const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
      const target = utterancesOnCurrentMedia[idx - 1];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUtterance(target.id);
        const el = (e.target as HTMLElement).closest('[tabindex]') as HTMLElement | null;
        if (el) requestAnimationFrame(() => el.focus());
      }
    },
    navNext: (e) => {
      if (!selectedUtteranceId) return;
      const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
      const target = utterancesOnCurrentMedia[idx + 1];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUtterance(target.id);
        const el = (e.target as HTMLElement).closest('[tabindex]') as HTMLElement | null;
        if (el) requestAnimationFrame(() => el.focus());
      }
    },
    tabNext: () => {
      if (!selectedUtteranceId) return;
      const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
      const target = utterancesOnCurrentMedia[idx + 1];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUtterance(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
      }
    },
    tabPrev: () => {
      if (!selectedUtteranceId) return;
      const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
      const target = utterancesOnCurrentMedia[idx - 1];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUtterance(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
      }
    },
  };

  // Global keybinding handler (undo, redo, search — active everywhere)
  useEffect(() => {
    const globalActions: Record<string, () => void> = {
      undo:   () => void undo(),
      redo:   () => void redo(),
      search: () => setShowSearch(true),
    };
    const onKeyDown = (e: KeyboardEvent) => {
      for (const [actionId, combo] of keymap) {
        const entry = DEFAULT_KEYBINDINGS.find((b) => b.id === actionId);
        if (!entry || entry.scope !== 'global') continue;
        if (matchKeyEvent(e, combo) && globalActions[actionId]) {
          e.preventDefault();
          globalActions[actionId]();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, keymap]);

  /**
   * Navigate to prev/next utterance from an inline <input>, save current edit,
   * then play the target segment. The next render will auto-focus the new input.
   */
  const navigateUtteranceFromInput = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, direction: 1 | -1) => {
      e.preventDefault();
      (e.target as HTMLInputElement).blur(); // triggers onBlur save
      const idx = utterancesOnCurrentMedia.findIndex((u) => u.id === selectedUtteranceId);
      if (idx < 0) return;
      const target = utterancesOnCurrentMedia[idx + direction];
      if (target) {
        manualSelectTsRef.current = Date.now();
        selectUtterance(target.id);
        if (player.isReady) player.playRegion(target.startTime, target.endTime);
      }
    },
    [utterancesOnCurrentMedia, selectedUtteranceId, selectUtterance, player],
  );

  // ---- Waveform keydown via keybinding dispatch ----
  const handleWaveformKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

    for (const [actionId, combo] of keymap) {
      const entry = DEFAULT_KEYBINDINGS.find((b) => b.id === actionId);
      if (!entry || entry.scope !== 'waveform') continue;
      if (matchKeyEvent(e, combo)) {
        e.preventDefault();
        waveformActionsRef.current[actionId]?.(e);
        return;
      }
    }
  }, [keymap]);

  // When multiple utterances are selected, move focus to the waveform area
  // so batch-operation shortcuts (Delete, Merge, etc.) work immediately.
  useEffect(() => {
    if (selectedUtteranceIds.size > 1) {
      waveformAreaRef.current?.focus();
    }
  }, [selectedUtteranceIds.size]);

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
      let parsed: { utterances: Array<{ startTime: number; endTime: number; transcription: string }> };

      if (name.endsWith('.eaf')) {
        parsed = importFromEaf(text);
      } else if (name.endsWith('.textgrid')) {
        parsed = importFromTextGrid(text);
      } else {
        setSaveState({ kind: 'error', message: '不支持的文件格式，请选择 .eaf 或 .TextGrid 文件。' });
        return;
      }

      const textId = activeTextId ?? (await getActiveTextId());
      if (!textId) { setSaveState({ kind: 'error', message: '请先创建项目。' }); return; }
      const mediaId = selectedUtteranceMedia?.id ?? '';
      const db = await getDb();
      const now = new Date().toISOString();

      for (const u of parsed.utterances) {
        await db.collections.utterances.insert({
          id: newId('utt'),
          textId,
          mediaId,
          transcription: { default: u.transcription },
          startTime: Number(u.startTime.toFixed(3)),
          endTime: Number(u.endTime.toFixed(3)),
          isVerified: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      await loadSnapshot();
      setSaveState({ kind: 'done', message: `已导入 ${parsed.utterances.length} 条句段。` });
    } catch (err) {
      setSaveState({ kind: 'error', message: `导入失败: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [activeTextId, selectedUtteranceMedia, loadSnapshot, setSaveState]);

  // ── Search / Replace ──

  const searchableItems = useMemo(() => {
    const items: Array<{ utteranceId: string; layerId?: string; text: string }> = [];
    for (const utt of utterancesOnCurrentMedia) {
      items.push({ utteranceId: utt.id, text: utt.transcription?.default ?? '' });
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
  }, [utterancesOnCurrentMedia, translationLayers, translationTextByLayer]);

  const handleSearchReplace = useCallback(
    (utteranceId: string, layerId: string | undefined, _oldText: string, newText: string) => {
      if (layerId) {
        void saveTextTranslationForUtterance(utteranceId, newText, layerId);
      } else {
        void saveUtteranceText(utteranceId, newText);
      }
    },
    [saveUtteranceText, saveTextTranslationForUtterance],
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
                  if (snap) void applyRecovery(snap);
                  setRecoveryAvailable(false);
                }}
              >
                恢复
              </button>
              <button
                style={{ padding: '2px 10px', borderRadius: 4, background: '#e5e7eb', border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  void dismissRecovery();
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
              currentTime={player.currentTime}
              duration={player.duration}
              playbackRate={player.playbackRate}
              onPlaybackRateChange={player.setPlaybackRate}
              volume={player.volume}
              onVolumeChange={player.setVolume}
              loop={loopPlayback}
              onLoopChange={setLoopPlayback}
              selectedRowMeta={selectedRowMeta}
              onTogglePlayback={player.togglePlayback}
              onSeek={player.seekBySeconds}
            >
              <button className="icon-btn" onClick={() => void loadSnapshot()} title="刷新数据">
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
                  void (async () => {
                    await LinguisticService.deleteAudio(selectedUtteranceMedia.id);
                    await loadSnapshot();
                    setSelectedUtteranceId('');
                    setSaveState({ kind: 'done', message: '音频已删除。' });
                  })();
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
                  void (async () => {
                    await LinguisticService.deleteProject(activeTextId);
                    setActiveTextId(null);
                    setSelectedUtteranceId('');
                    await loadSnapshot();
                    setSaveState({ kind: 'done', message: '项目已删除。' });
                  })();
                }}
              >
                <Trash2 size={14} />
              </button>
              <button className="icon-btn" onClick={() => void ensureDemoData()} title="示例数据">
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
                  if (file) void handleImportFile(file);
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
                    return (
                      <div
                        className="region-action-overlay"
                        style={{ left: Math.max(0, leftPx) }}
                      >
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
                        <button
                          className={`region-action-btn ${loopPlayback ? 'region-action-btn-active' : ''}`}
                          title={loopPlayback ? '关闭循环播放' : '循环播放该语段'}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (loopPlayback) {
                              setLoopPlayback(false);
                              player.stop();
                            } else {
                              setLoopPlayback(true);
                              const s = subSelectionRange ?? { start: selectedUtterance.startTime, end: selectedUtterance.endTime };
                              player.playRegion(s.start, s.end);
                            }
                          }}
                        >
                          <Repeat size={13} />
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
                          <button className="btn btn-sm" onClick={() => { void handleCreateTranscriptionFromPanel(); }}>创建</button>
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
                          <button className="btn btn-sm" onClick={() => { void handleCreateTranslationFromPanel(); }}>创建</button>
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
                            onClick={() => { void handleDeleteLayerFromPanel(); }}
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
                      const dur = player.duration || 0;
                      if (dur > 0 && zoomPxPerSec > 0) {
                        const sl = e.currentTarget.scrollLeft;
                        const cw = e.currentTarget.clientWidth;
                        const tw = Math.max(cw, Math.ceil(dur * zoomPxPerSec));
                        setRulerView({ start: (sl / tw) * dur, end: Math.min(dur, ((sl + cw) / tw) * dur) });
                      }
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
                            const draft = utteranceDrafts[utt.id] ?? utt.transcription.default ?? '';
                            const dpStart = dragPreview?.id === utt.id ? dragPreview.start : utt.startTime;
                            const dpEnd = dragPreview?.id === utt.id ? dragPreview.end : utt.endTime;
                            const isCompact = (dpEnd - dpStart) * zoomPxPerSec < 36;
                            return (
                              <div
                                key={utt.id}
                                className={`timeline-annotation ${isSelected ? 'timeline-annotation-selected' : ''} ${isActive ? 'timeline-annotation-active' : ''} ${isCompact ? 'timeline-annotation-compact' : ''}`}
                                style={{
                                  left: dpStart * zoomPxPerSec,
                                  width: Math.max(4, (dpEnd - dpStart) * zoomPxPerSec),
                                }}
                                onClick={(e) => {
                                  manualSelectTsRef.current = Date.now();
                                  if (e.shiftKey && selectedUtteranceId) {
                                    selectUtteranceRange(selectedUtteranceId, utt.id);
                                  } else if (e.metaKey || e.ctrlKey) {
                                    toggleUtteranceSelection(utt.id);
                                  } else {
                                    selectUtterance(utt.id);
                                  }
                                  setFocusedLayerRowId(layer.id);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  manualSelectTsRef.current = Date.now();
                                  selectUtterance(utt.id);
                                  setFocusedLayerRowId(layer.id);
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
                                  setCtxMenu({ x: e.clientX, y: e.clientY, utteranceId: utt.id, splitTime });
                                }}
                                title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}`}
                                onDoubleClick={() => zoomToUtterance(utt.startTime, utt.endTime)}
                              >
                                <span
                                  className="timeline-annotation-resize-handle timeline-annotation-resize-handle-start"
                                  onPointerDown={(e) => {
                                    startTimelineResizeDrag(e, utt, 'start', layer.id);
                                  }}
                                />
                                <span
                                  className="timeline-annotation-resize-handle timeline-annotation-resize-handle-end"
                                  onPointerDown={(e) => {
                                    startTimelineResizeDrag(e, utt, 'end', layer.id);
                                  }}
                                />
                                {isActive ? (
                                  <input
                                    className="timeline-annotation-input"
                                    value={draft}
                                    autoFocus
                                    onChange={(e) => {
                                      const value = normalizeSingleLine(e.target.value);
                                      setUtteranceDrafts((prev) => ({ ...prev, [utt.id]: value }));
                                      if (value !== (utt.transcription.default ?? '')) {
                                        scheduleAutoSave(`utt-${utt.id}`, async () => {
                                          await saveUtteranceText(utt.id, value);
                                        });
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const value = normalizeSingleLine(e.target.value);
                                      clearAutoSaveTimer(`utt-${utt.id}`);
                                      if (value !== (utt.transcription.default ?? '')) {
                                        void saveUtteranceText(utt.id, value);
                                      }
                                    }}
                                    onKeyDown={(e) => {
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
                                    }}
                                  />
                                ) : (
                                  <span>{draft || '\u00A0'}</span>
                                )}
                              </div>
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
                            const isCompact = (dpEnd - dpStart) * zoomPxPerSec < 36;
                            return (
                              <div
                                key={utt.id}
                                className={`timeline-annotation ${isSelected ? 'timeline-annotation-selected' : ''} ${isActive ? 'timeline-annotation-active' : ''} ${isCompact ? 'timeline-annotation-compact' : ''}`}
                                style={{
                                  left: dpStart * zoomPxPerSec,
                                  width: Math.max(4, (dpEnd - dpStart) * zoomPxPerSec),
                                }}
                                onClick={(e) => {
                                  manualSelectTsRef.current = Date.now();
                                  if (e.shiftKey && selectedUtteranceId) {
                                    selectUtteranceRange(selectedUtteranceId, utt.id);
                                  } else if (e.metaKey || e.ctrlKey) {
                                    toggleUtteranceSelection(utt.id);
                                  } else {
                                    selectUtterance(utt.id);
                                  }
                                  setSelectedLayerId(layer.id);
                                  setFocusedLayerRowId(layer.id);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  manualSelectTsRef.current = Date.now();
                                  selectUtterance(utt.id);
                                  setSelectedLayerId(layer.id);
                                  setFocusedLayerRowId(layer.id);
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
                                  setCtxMenu({ x: e.clientX, y: e.clientY, utteranceId: utt.id, splitTime });
                                }}
                                title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}`}
                                onDoubleClick={() => zoomToUtterance(utt.startTime, utt.endTime)}
                              >
                                <span
                                  className="timeline-annotation-resize-handle timeline-annotation-resize-handle-start"
                                  onPointerDown={(e) => {
                                    startTimelineResizeDrag(e, utt, 'start', layer.id);
                                  }}
                                />
                                <span
                                  className="timeline-annotation-resize-handle timeline-annotation-resize-handle-end"
                                  onPointerDown={(e) => {
                                    startTimelineResizeDrag(e, utt, 'end', layer.id);
                                  }}
                                />
                                {isActive ? (
                                  <input
                                    className="timeline-annotation-input"
                                    value={draft}
                                    autoFocus
                                    placeholder="翻译"
                                    onChange={(e) => {
                                      const value = normalizeSingleLine(e.target.value);
                                      setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                                      if (value.trim() && value !== text) {
                                        scheduleAutoSave(`tr-${layer.id}-${utt.id}`, async () => {
                                          await saveTextTranslationForUtterance(utt.id, value, layer.id);
                                        });
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const value = normalizeSingleLine(e.target.value);
                                      clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                                      if (value.trim() && value !== text) {
                                        void saveTextTranslationForUtterance(utt.id, value, layer.id);
                                      }
                                    }}
                                    onKeyDown={(e) => {
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
                                    }}
                                  />
                                ) : (
                                  <span>{draft || '\u00A0'}</span>
                                )}
                              </div>
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
                    <button className="icon-btn" onClick={() => zoomToPercent(100)} title="适应全部">
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
                      onClick={() => zoomToPercent(Math.round((100 / fitPxPerSec) * 100))}
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
                        zoomToPercent(pct);
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
                                void undoToHistoryIndex(idx);
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
