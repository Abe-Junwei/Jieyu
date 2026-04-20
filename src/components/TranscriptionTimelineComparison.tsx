import '../styles/pages/timeline/timeline-comparison.css';
import type {
  LayerDisplaySettings,
  LayerDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
  OrthographyDocType,
} from '../db';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { unitToView } from '../hooks/timelineUnitView';
import { useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';
import { useToast } from '../contexts/ToastContext';
import { t, useLocale } from '../i18n';
import type { TranscriptionComparisonViewFocusState } from '../pages/TranscriptionPage.UIState';
import { DEFAULT_TRANSCRIPTION_COMPARISON_FOCUS } from '../pages/TranscriptionPage.UIState';
import { type TimelineDraftSaveStatus } from './transcription/TimelineDraftEditorSurface';
import { TranscriptionTimelineComparisonGroupList } from './TranscriptionTimelineComparisonGroupList';
import {
  buildComparisonGroups,
  pickTranslationSegmentForPersist,
  type ComparisonGroup,
  type ComparisonTargetItem,
} from '../utils/transcriptionComparisonGroups';
import { buildLayerBundles } from '../services/LayerOrderingService';
import {
  filterTranslationLayersForComparisonGroup,
  pickTranslationLayerForComparisonUnit,
} from '../utils/comparisonHostFilter';
import { useTranscriptionTimelineComparisonChrome } from '../hooks/useTranscriptionTimelineComparisonChrome';
import {
  BASE_FONT_SIZE,
  computeFontSizeFromRenderPolicy,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { LayerActionPopover } from './LayerActionPopover';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import { type LayerOperationActionType } from './layerOperationMenuItems';
import {
  COMPARISON_COLUMN_LEFT_GROW_KEY,
  COMPARISON_EDITOR_HEIGHT_KEY,
  COMPARISON_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX,
  accumulatedOffsetTopUntil,
  buildLayerIdToHorizontalBundleRootIdMap,
  comparisonUsesSplitTargetEditors,
  mergeComparisonUnitById,
  readStoredComparisonEditorHeight,
  readStoredComparisonEditorHeightMap,
  readStoredComparisonLeftGrow,
  resolveComparisonExplicitTargetItemsForLayer,
  resolveComparisonGroupSourceUnits,
  resolveComparisonLayerLabel,
  resolveComparisonTargetPlainTextForLayer,
} from './transcriptionTimelineComparisonHelpers';
import { type ComparisonCompactMode } from '../hooks/useTimelineVisibilityState';





type ComparisonLayerActionType =
  Exclude<LayerOperationActionType, 'delete'>;

const EMPTY_SPEAKER_VISUAL_BY_UNIT_ID = Object.freeze({}) as Record<string, { name: string; color: string }>;




interface TranscriptionTimelineComparisonProps {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks?: LayerLinkDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  focusedLayerRowId: string;
  activeUnitId?: string;
  onFocusLayer: (layerId: string) => void;
  comparisonFocus?: TranscriptionComparisonViewFocusState;
  updateComparisonFocus?: (patch: Partial<TranscriptionComparisonViewFocusState>) => void;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: Array<{ id: string; startTime: number }>,
  ) => void;
  handleAnnotationContextMenu?: (
    uttId: string,
    utt: ReturnType<typeof unitToView>,
    layerId: string,
    e: React.MouseEvent,
  ) => void;
  /** 与纯文本时间轴一致：语段轨时从 segmentsByLayer 取行，而非仅用宿主句列表 */
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentParentUnitLookup?: LayerUnitDocType[];
  allLayersOrdered?: LayerDocType[];
  deletableLayers?: LayerDocType[];
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  defaultTranscriptionLayerId?: string;
  activeSpeakerFilterKey?: string;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  handleNoteClick?: (unitId: string, layerId: string | undefined, event: React.MouseEvent) => void;
  resolveNoteIndicatorTarget?: (unitId: string, layerId?: string, scope?: 'timeline' | 'waveform') => { count: number; layerId?: string } | null;
  resolveSelfCertaintyForUnit?: (unitId: string, layerId?: string) => UnitSelfCertainty | undefined;
  resolveSelfCertaintyAmbiguityForUnit?: (unitId: string, layerId?: string) => boolean;
  mediaItems?: MediaItemDocType[];
  recording?: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  transcribeVoiceTranslation?: (
    unit: LayerUnitDocType,
    layer: LayerDocType,
    options?: { signal?: AbortSignal; audioBlob?: Blob },
  ) => Promise<void>;
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof import('./LayerStyleSubmenu').buildLayerStyleMenuItems>[7];
  };
  speakerVisualByUnitId?: Record<string, { name: string; color: string }>;
  /** 与文本时间轴一致：Tab 在句间跳转选中（多行编辑器不占用 Enter） */
  navigateUnitFromInput?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, direction: -1 | 1) => void;
}

/**
 * 左右对照视图（P0）| Side-by-side comparison view (P0)
 */
export function TranscriptionTimelineComparison({
  transcriptionLayers,
  translationLayers,
  layerLinks = [],
  unitsOnCurrentMedia,
  focusedLayerRowId,
  activeUnitId,
  onFocusLayer,
  comparisonFocus: comparisonFocusProp,
  updateComparisonFocus,
  segmentContentByLayer,
  saveSegmentContentForLayer,
  handleAnnotationClick,
  handleAnnotationContextMenu,
  segmentsByLayer,
  segmentParentUnitLookup,
  allLayersOrdered,
  deletableLayers,
  defaultLanguageId,
  defaultOrthographyId,
  defaultTranscriptionLayerId,
  activeSpeakerFilterKey,
  translationAudioByLayer,
  handleNoteClick,
  resolveNoteIndicatorTarget,
  resolveSelfCertaintyForUnit,
  resolveSelfCertaintyAmbiguityForUnit,
  mediaItems = [],
  recording = false,
  recordingUnitId = null,
  recordingLayerId = null,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
  transcribeVoiceTranslation,
  displayStyleControl,
  speakerVisualByUnitId,
  navigateUnitFromInput,
}: TranscriptionTimelineComparisonProps) {
  const stableSpeakerVisualByUnitId = speakerVisualByUnitId ?? EMPTY_SPEAKER_VISUAL_BY_UNIT_ID;
  const locale = useLocale();
  const { showToast } = useToast();
  const [internalComparisonFocus, setInternalComparisonFocus] = useState<TranscriptionComparisonViewFocusState>(
    () => ({ ...DEFAULT_TRANSCRIPTION_COMPARISON_FOCUS }),
  );
  const comparisonFocus = comparisonFocusProp != null && updateComparisonFocus != null
    ? comparisonFocusProp
    : internalComparisonFocus;
  const patchComparisonFocus = useCallback((patch: Partial<TranscriptionComparisonViewFocusState>) => {
    if (updateComparisonFocus != null) {
      updateComparisonFocus(patch);
    } else {
      setInternalComparisonFocus((prev) => {
        const entries = Object.entries(patch) as Array<[
          keyof TranscriptionComparisonViewFocusState,
          TranscriptionComparisonViewFocusState[keyof TranscriptionComparisonViewFocusState],
        ]>;
        if (entries.every(([key, value]) => prev[key] === value)) return prev;
        return { ...prev, ...patch };
      });
    }
  }, [updateComparisonFocus]);
  const activeComparisonGroupId = comparisonFocus.activeComparisonGroupId;
  const activeComparisonCellId = comparisonFocus.activeComparisonCellId;
  const comparisonTargetSide = comparisonFocus.comparisonTargetSide;
  const contextMenuSourceUnitId = comparisonFocus.contextMenuSourceUnitId;
  const [compactMode, setCompactMode] = useState<ComparisonCompactMode>('both');
  /** 按语段 rootUnitId 对照组块筛选；与侧栏「层树 bundle」无关 | Filter comparison rows by unit bundle root id */
  const [comparisonBundleFilterRootId, setComparisonBundleFilterRootId] = useState<string | null>(null);
  const [layerContextMenu, setLayerContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
    anchorOrigin?: 'top-left' | 'bottom-left';
  } | null>(null);
  const [layerAction, setLayerAction] = useState<{ action: ComparisonLayerActionType; layerId: string | undefined } | null>(null);
  const [comparisonLeftGrow, setComparisonLeftGrow] = useState(readStoredComparisonLeftGrow);
  const [comparisonEditorHeightByGroup, setComparisonEditorHeightByGroup] = useState<Record<string, number>>(readStoredComparisonEditorHeightMap);
  const [defaultComparisonEditorHeight] = useState(readStoredComparisonEditorHeight);
  const comparisonViewRef = useRef<HTMLDivElement | null>(null);
  const comparisonSplitHostRef = useRef<HTMLDivElement | null>(null);
  const comparisonLeftGrowRef = useRef(comparisonLeftGrow);
  const comparisonSplitDragRef = useRef<{ pointerId: number } | null>(null);
  const comparisonSplitPendingClientXRef = useRef<number | null>(null);
  const comparisonSplitDragRafRef = useRef<number | null>(null);
  const comparisonSplitCleanupRef = useRef<(() => void) | null>(null);
  const [isComparisonColumnSplitDragging, setIsComparisonColumnSplitDragging] = useState(false);

  useEffect(() => {
    comparisonLeftGrowRef.current = comparisonLeftGrow;
  }, [comparisonLeftGrow]);

  const [isNarrowComparisonLayout, setIsNarrowComparisonLayout] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 960px)');
    const sync = () => setIsNarrowComparisonLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** 以首组左右列 getBoundingClientRect 为准，避免 %/滚动条与 fr 栅格亚像素漂移 | Measured gutter vs CSS calc drift */
  const comparisonSplitMeasureRef = useRef<{
    trackStartFromHostPaddingLeft: number;
    trackPx: number;
    gapPx: number;
  } | null>(null);

  const measureComparisonSplitLayout = useCallback(() => {
    const host = comparisonSplitHostRef.current;
    const clearSplitterLineTopVar = () => {
      const innerEl = host?.querySelector('.timeline-comparison-split-host-inner') as HTMLElement | null;
      innerEl?.style.removeProperty('--timeline-comparison-global-splitter-line-top');
    };
    if (!host || compactMode !== 'both' || isNarrowComparisonLayout) {
      clearSplitterLineTopVar();
      host?.style.removeProperty('--comparison-splitter-center-x');
      comparisonSplitMeasureRef.current = null;
      return;
    }
    const group = host.querySelector('.timeline-comparison-group') as HTMLElement | null;
    const src = group?.querySelector('.timeline-comparison-source-column') as HTMLElement | null;
    const tgt = group?.querySelector('.timeline-comparison-target-column') as HTMLElement | null;
    if (!group || !src || !tgt) {
      clearSplitterLineTopVar();
      host.style.removeProperty('--comparison-splitter-center-x');
      comparisonSplitMeasureRef.current = null;
      return;
    }
    const hostStyle = getComputedStyle(host);
    const padL = parseFloat(hostStyle.paddingLeft) || 0;
    const hr = host.getBoundingClientRect();
    const sr = src.getBoundingClientRect();
    const tr = tgt.getBoundingClientRect();
    const gapPx = Math.max(0, tr.left - sr.right);
    const gapCenterViewport = (sr.right + tr.left) / 2;
    const paddingLeftEdge = hr.left + padL;
    const gapCenterFromHostPaddingLeft = gapCenterViewport - paddingLeftEdge;
    host.style.setProperty('--comparison-splitter-center-x', `${gapCenterFromHostPaddingLeft}px`);
    comparisonSplitMeasureRef.current = {
      trackStartFromHostPaddingLeft: sr.left - paddingLeftEdge,
      trackPx: Math.max(40, tr.right - sr.left),
      gapPx,
    };
    const inner = host.querySelector('.timeline-comparison-split-host-inner') as HTMLElement | null;
    const headerEl = host.querySelector('.timeline-comparison-header') as HTMLElement | null;
    if (inner && group) {
      const innerStyle = getComputedStyle(inner);
      const rowGap = parseFloat(innerStyle.rowGap || innerStyle.columnGap || innerStyle.gap || '8') || 8;
      const fromHeader = headerEl && headerEl.offsetHeight > 0 ? headerEl.offsetHeight + rowGap : 0;
      const fromFirstGroup = accumulatedOffsetTopUntil(group, inner);
      const layoutTop = Math.max(fromHeader, fromFirstGroup ?? 0);
      const lineTopPx = Math.max(0, Math.round(layoutTop + COMPARISON_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX));
      /* split-host-inner 顶 → 分割条命中区顶；无吸顶层头时 fromHeader 为 0，仅靠首组 offset */
      inner.style.setProperty('--timeline-comparison-global-splitter-line-top', `${lineTopPx}px`);
    }
  }, [compactMode, isNarrowComparisonLayout]);

  useEffect(() => () => {
    comparisonSplitCleanupRef.current?.();
    comparisonSplitCleanupRef.current = null;
    comparisonSplitDragRef.current = null;
    comparisonSplitPendingClientXRef.current = null;
    if (comparisonSplitDragRafRef.current != null) {
      cancelAnimationFrame(comparisonSplitDragRafRef.current);
      comparisonSplitDragRafRef.current = null;
    }
    document.body.style.userSelect = '';
  }, []);

  const resetComparisonColumnsToEqualWidth = useCallback(() => {
    if (compactMode !== 'both' || isNarrowComparisonLayout) return;
    setComparisonLeftGrow(50);
    comparisonLeftGrowRef.current = 50;
    try {
      localStorage.setItem(COMPARISON_COLUMN_LEFT_GROW_KEY, '50');
    } catch {
      /* ignore */
    }
  }, [compactMode, isNarrowComparisonLayout]);

  const handleComparisonSplitterPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (compactMode !== 'both' || isNarrowComparisonLayout) return;
    if (event.button !== 0) return;
    if (event.detail >= 2) {
      event.preventDefault();
      event.stopPropagation();
      resetComparisonColumnsToEqualWidth();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const host = comparisonSplitHostRef.current;
    if (!host) return;

    comparisonSplitCleanupRef.current?.();
    comparisonSplitCleanupRef.current = null;

    const pointerId = event.pointerId;
    comparisonSplitDragRef.current = { pointerId };

    const sidePad = 10;
    const columnInset = 10;
    const colGap = 8;

    const applyComparisonSplitClientX = (clientX: number) => {
      measureComparisonSplitLayout();
      const m = comparisonSplitMeasureRef.current;
      const rect = host.getBoundingClientRect();
      const hostStyle = getComputedStyle(host);
      const padL = parseFloat(hostStyle.paddingLeft) || 0;
      const paddingLeftEdge = rect.left + padL;
      let raw: number;
      if (m && m.trackPx > m.gapPx + 4) {
        raw = ((clientX - paddingLeftEdge - m.trackStartFromHostPaddingLeft - m.gapPx / 2) / (m.trackPx - m.gapPx)) * 100;
      } else {
        const contentWidth = Math.max(80, rect.width - 2 * sidePad);
        const track = Math.max(40, contentWidth - 2 * columnInset - colGap);
        const pointerBase = rect.left + sidePad + columnInset;
        raw = ((clientX - pointerBase - colGap / 2) / track) * 100;
      }
      const next = Math.min(80, Math.max(20, Math.round(raw)));
      comparisonLeftGrowRef.current = next;
      setComparisonLeftGrow(next);
    };

    const flushScheduledComparisonSplit = () => {
      if (comparisonSplitDragRafRef.current != null) {
        cancelAnimationFrame(comparisonSplitDragRafRef.current);
        comparisonSplitDragRafRef.current = null;
      }
      const pending = comparisonSplitPendingClientXRef.current;
      comparisonSplitPendingClientXRef.current = null;
      if (pending != null) {
        applyComparisonSplitClientX(pending);
      }
    };

    const scheduleComparisonSplitClientX = (clientX: number) => {
      comparisonSplitPendingClientXRef.current = clientX;
      if (comparisonSplitDragRafRef.current != null) return;
      comparisonSplitDragRafRef.current = requestAnimationFrame(() => {
        comparisonSplitDragRafRef.current = null;
        const pending = comparisonSplitPendingClientXRef.current;
        if (pending == null) return;
        applyComparisonSplitClientX(pending);
      });
    };

    const onWindowPointerMove = (ev: PointerEvent) => {
      if (comparisonSplitDragRef.current?.pointerId !== ev.pointerId) return;
      scheduleComparisonSplitClientX(ev.clientX);
    };

    const finish = (ev: PointerEvent) => {
      if (comparisonSplitDragRef.current?.pointerId !== ev.pointerId) return;
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      comparisonSplitCleanupRef.current = null;
      comparisonSplitDragRef.current = null;
      flushScheduledComparisonSplit();
      setIsComparisonColumnSplitDragging(false);
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(COMPARISON_COLUMN_LEFT_GROW_KEY, String(comparisonLeftGrowRef.current));
      } catch {
        /* ignore */
      }
    };

    comparisonSplitCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (comparisonSplitDragRafRef.current != null) {
        cancelAnimationFrame(comparisonSplitDragRafRef.current);
        comparisonSplitDragRafRef.current = null;
      }
      comparisonSplitPendingClientXRef.current = null;
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    document.body.style.userSelect = 'none';
    setIsComparisonColumnSplitDragging(true);
    applyComparisonSplitClientX(event.clientX);
  }, [compactMode, isNarrowComparisonLayout, measureComparisonSplitLayout, resetComparisonColumnsToEqualWidth]);

  const [saveStatusByCellKey, setSaveStatusByCellKey] = useState<Record<string, NonNullable<TimelineDraftSaveStatus>>>({});
  const setComparisonCellSaveStatus = useCallback((cellKey: string, status?: NonNullable<TimelineDraftSaveStatus>) => {
    setSaveStatusByCellKey((prev) => {
      if (!status) {
        if (!(cellKey in prev)) return prev;
        const next = { ...prev };
        delete next[cellKey];
        return next;
      }
      if (prev[cellKey] === status) return prev;
      return { ...prev, [cellKey]: status };
    });
  }, []);
  const runComparisonSaveWithStatus = useCallback(async (cellKey: string, saveTask: () => Promise<void>) => {
    setComparisonCellSaveStatus(cellKey, 'saving');
    try {
      await saveTask();
      setComparisonCellSaveStatus(cellKey);
    } catch (err) {
      const blocked = err instanceof Error && err.message === 'COMPARISON_SEGMENT_PERSIST_BLOCKED';
      if (!blocked) {
        console.error('[Jieyu] TranscriptionTimelineComparison: cell save failed', { cellKey, err });
      }
      setComparisonCellSaveStatus(cellKey, 'error');
    }
  }, [setComparisonCellSaveStatus]);
  const {
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUnitText,
    saveUnitLayerText,
    getUnitTextForLayer,
    renderLaneLabel,
    createLayer,
    updateLayerMetadata,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  } = useTranscriptionEditorContext();

  const effectiveAllLayersOrdered = useMemo(
    () => (allLayersOrdered && allLayersOrdered.length > 0
      ? allLayersOrdered
      : [...transcriptionLayers, ...translationLayers]),
    [allLayersOrdered, transcriptionLayers, translationLayers],
  );
  const layerIdToHorizontalBundleRootId = useMemo(
    () => buildLayerIdToHorizontalBundleRootIdMap(effectiveAllLayersOrdered),
    [effectiveAllLayersOrdered],
  );
  const horizontalBundleRootIdsOrdered = useMemo(
    () => buildLayerBundles([...effectiveAllLayersOrdered]).map((b) => b.root.id),
    [effectiveAllLayersOrdered],
  );
  const effectiveDeletableLayers = deletableLayers ?? effectiveAllLayersOrdered;
  const canOpenTranslationCreate = effectiveAllLayersOrdered.some((item) => item.layerType === 'transcription');

  const {
    deleteLayerConfirm,
    deleteConfirmKeepUnits,
    setDeleteConfirmKeepUnits,
    requestDeleteLayer,
    cancelDeleteLayerConfirm,
    confirmDeleteLayer,
  } = useLayerDeleteConfirm({
    deletableLayers: effectiveDeletableLayers,
    checkLayerHasContent,
    deleteLayer,
    deleteLayerWithoutConfirm,
  });

  const targetLayer = useMemo(
    () => translationLayers.find((layer) => layer.id === focusedLayerRowId) ?? translationLayers[0],
    [focusedLayerRowId, translationLayers],
  );

  const sourceLayer = useMemo(
    () => transcriptionLayers.find((layer) => layer.id === focusedLayerRowId) ?? transcriptionLayers[0],
    [focusedLayerRowId, transcriptionLayers],
  );

  const unitByIdForSpeaker = useMemo(
    () => mergeComparisonUnitById(unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer),
    [unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer],
  );

  const comparisonGroupSourceUnits = useMemo(
    () => resolveComparisonGroupSourceUnits({
      transcriptionLayers,
      translationLayers,
      unitsOnCurrentMedia,
      segmentParentUnitLookup,
      segmentsByLayer,
      allLayersOrdered,
      defaultTranscriptionLayerId,
      activeSpeakerFilterKey,
      unitByIdForSpeaker,
    }),
    [
      activeSpeakerFilterKey,
      allLayersOrdered,
      defaultTranscriptionLayerId,
      segmentParentUnitLookup,
      segmentsByLayer,
      transcriptionLayers,
      translationLayers,
      unitByIdForSpeaker,
      unitsOnCurrentMedia,
    ],
  );


  const mediaItemById = useMemo(
    () => new Map(mediaItems.map((item) => [item.id, item] as const)),
    [mediaItems],
  );

  /** 与媒体/文本时间轴一致：语段化转写下一语段一行译文，禁止按「相同译文」把相邻语段并成一组 */
  const comparisonUsesSegmentSourceRows = useMemo(
    () => transcriptionLayers.some(
      (l) => layerUsesOwnSegments(l, defaultTranscriptionLayerId),
    ),
    [transcriptionLayers, defaultTranscriptionLayerId],
  );

  const groups = useMemo(() => {
    const disableMergeForGrouping = comparisonUsesSegmentSourceRows || translationLayers.length > 1;
    return buildComparisonGroups({
      units: comparisonGroupSourceUnits,
      ...(disableMergeForGrouping ? { maxMergeGapSec: -1 } : {}),
      sourceLayerIds: transcriptionLayers.map((layer) => layer.id),
      getSourceText: (unit) => {
        const layerId = (typeof unit.layerId === 'string' && unit.layerId.trim()) || sourceLayer?.id;
        return getUnitTextForLayer(unit, layerId) || getUnitTextForLayer(unit) || '';
      },
      getTargetText: (unit) => {
        const tPick = pickTranslationLayerForComparisonUnit(
          unit,
          translationLayers,
          targetLayer,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          layerLinks,
        );
        if (!tPick) return '';
        return resolveComparisonTargetPlainTextForLayer(
          unit,
          tPick,
          defaultTranscriptionLayerId,
          segmentsByLayer,
          segmentContentByLayer,
          translationTextByLayer,
          unitByIdForSpeaker,
        );
      },
      getTargetItems: (unit) => {
        const tPick = pickTranslationLayerForComparisonUnit(
          unit,
          translationLayers,
          targetLayer,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          layerLinks,
        );
        if (!tPick) return undefined;
        return resolveComparisonExplicitTargetItemsForLayer(
          unit,
          tPick,
          defaultTranscriptionLayerId,
          segmentsByLayer,
          segmentContentByLayer,
          unitByIdForSpeaker,
        );
      },
      getSpeakerLabel: (unit) => stableSpeakerVisualByUnitId[unit.id]?.name ?? '',
    });
  }, [
    comparisonUsesSegmentSourceRows,
    comparisonGroupSourceUnits,
    defaultTranscriptionLayerId,
    getUnitTextForLayer,
    segmentContentByLayer,
    segmentsByLayer,
    sourceLayer?.id,
    targetLayer,
    stableSpeakerVisualByUnitId,
    transcriptionLayers,
    translationLayers,
    translationTextByLayer,
    unitByIdForSpeaker,
    layerLinks,
  ]);

  useLayoutEffect(() => {
    measureComparisonSplitLayout();
    const host = comparisonSplitHostRef.current;
    if (!host) return;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          measureComparisonSplitLayout();
        })
      : null;
    ro?.observe(host);
    const headerEl = host.querySelector('.timeline-comparison-header') as HTMLElement | null;
    const innerEl = host.querySelector('.timeline-comparison-split-host-inner') as HTMLElement | null;
    if (headerEl) ro?.observe(headerEl);
    if (innerEl) ro?.observe(innerEl);
    window.addEventListener('resize', measureComparisonSplitLayout);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measureComparisonSplitLayout);
    };
  }, [groups.length, comparisonLeftGrow, measureComparisonSplitLayout, compactMode, isNarrowComparisonLayout]);

  const persistGroupTranslation = useCallback(async (
    persistLayer: LayerDocType,
    group: ComparisonGroup,
    anchorUnitIds: string[],
    value: string,
  ) => {
    const usesSeg = layerUsesOwnSegments(persistLayer, defaultTranscriptionLayerId);
    if (usesSeg && saveSegmentContentForLayer) {
      const trSegs = segmentsByLayer?.get(persistLayer.id) ?? [];
      const pick = pickTranslationSegmentForPersist(trSegs, group.startTime, group.endTime);
      if (pick?.id) {
        await saveSegmentContentForLayer(pick.id, persistLayer.id, value);
        return;
      }
      const hint = t(locale, 'transcription.comparison.segmentMissingForSave');
      showToast(hint, 'error', 8000);
      throw new Error('COMPARISON_SEGMENT_PERSIST_BLOCKED');
    }
    await Promise.all(anchorUnitIds.map((unitId) => saveUnitLayerText(unitId, value, persistLayer.id)));
  }, [
    defaultTranscriptionLayerId,
    locale,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    segmentsByLayer,
    showToast,
  ]);

  const persistComparisonTargetTranslation = useCallback(async (
    persistLayer: LayerDocType,
    targetItem: ComparisonTargetItem,
    group: ComparisonGroup,
    anchorUnitIds: string[],
    value: string,
    combinedValue?: string,
  ) => {
    const segId = typeof targetItem.translationSegmentId === 'string' ? targetItem.translationSegmentId.trim() : '';
    if (segId.length > 0 && saveSegmentContentForLayer) {
      await saveSegmentContentForLayer(segId, persistLayer.id, value);
      return;
    }
    await persistGroupTranslation(persistLayer, group, anchorUnitIds, combinedValue ?? value);
  }, [persistGroupTranslation, saveSegmentContentForLayer]);

  const persistSourceText = useCallback(async (unitId: string, value: string, layerId?: string) => {
    await saveUnitText(unitId, value, layerId);
  }, [saveUnitText]);

  const {
    visibleGroups,
    orderedDistinctBundleKeys,
    bundleOrdinalByKey,
    bundleFilterMenuItems,
    bundleFilterButtonTitle,
    sourceHeaderContent,
    comparisonHeaderOrthographies,
    resolveComparisonHeaderContentForLayer,
    headerTargetLayers,
    comparisonStyleMenuItems,
    buildComparisonHeaderMenuItems,
    comparisonHeaderMenuItems,
    openComparisonMenuAtPointer,
    toggleComparisonMenuFromButton,
  } = useTranscriptionTimelineComparisonChrome({
    locale,
    groups,
    activeComparisonGroupId,
    activeUnitId,
    sourceLayer,
    targetLayer,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    layerLinks,
    layerIdToHorizontalBundleRootId,
    horizontalBundleRootIdsOrdered,
    effectiveAllLayersOrdered,
    comparisonBundleFilterRootId,
    setComparisonBundleFilterRootId,
    displayStyleControl,
    compactMode,
    setCompactMode,
    onFocusLayer,
    effectiveDeletableLayers,
    canOpenTranslationCreate,
    requestDeleteLayer,
    onLayerAction: (action, layerId) => setLayerAction({ action, layerId }),
    setLayerContextMenu,
  });


  const [comparisonResizeFontPreviewByLayerId, setComparisonResizeFontPreviewByLayerId] = useState<Record<string, number>>({});

  const handleComparisonEditorLaneChange = useCallback((groupKey: string, nextHeight: number) => {
    setComparisonEditorHeightByGroup((prev) => {
      if (prev[groupKey] === nextHeight) return prev;
      return { ...prev, [groupKey]: nextHeight };
    });
  }, []);

  const handleComparisonEditorResizeEnd = useCallback((groupKey: string, finalHeight: number) => {
    setComparisonResizeFontPreviewByLayerId({});
    setComparisonEditorHeightByGroup((prev) => {
      const next = prev[groupKey] === finalHeight ? prev : { ...prev, [groupKey]: finalHeight };
      try {
        localStorage.setItem(COMPARISON_EDITOR_HEIGHT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    if (!displayStyleControl || !groupKey.startsWith('comparison-editor:')) return;
    const groupId = groupKey.slice('comparison-editor:'.length);
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const orthographies = displayStyleControl.orthographies;
    const applyFont = (layer: LayerDocType, height: number) => {
      const pol = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
      const newFont = computeFontSizeFromRenderPolicy(height, pol);
      const oldFont = layer.displaySettings?.fontSize ?? BASE_FONT_SIZE;
      if (Math.abs(newFont - oldFont) > 0.1) {
        displayStyleControl.onUpdate(layer.id, { fontSize: newFont });
      }
    };
    const seenSource = new Set<string>();
    for (const item of group.sourceItems) {
      const lid = item.layerId ?? sourceLayer?.id ?? '';
      if (!lid || seenSource.has(lid)) continue;
      seenSource.add(lid);
      const layer = transcriptionLayers.find((l) => l.id === lid);
      if (layer) applyFont(layer, finalHeight);
    }
    const groupTranslationLayers = filterTranslationLayersForComparisonGroup(
      group,
      translationLayers,
      transcriptionLayers,
      defaultTranscriptionLayerId,
      sourceLayer?.id,
      layerLinks,
    );
    for (const tl of groupTranslationLayers) {
      applyFont(tl, finalHeight);
    }
  }, [defaultTranscriptionLayerId, displayStyleControl, groups, layerLinks, sourceLayer, transcriptionLayers, translationLayers]);

  const handleComparisonEditorResizePreview = useCallback((layerKey: string, previewHeight: number) => {
    if (!displayStyleControl) return;
    if (!layerKey.startsWith('comparison-editor:')) return;
    const groupId = layerKey.slice('comparison-editor:'.length);
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const orthographies = displayStyleControl.orthographies;
    const next: Record<string, number> = {};
    const seenSource = new Set<string>();
    for (const item of group.sourceItems) {
      const lid = item.layerId ?? sourceLayer?.id ?? '';
      if (!lid || seenSource.has(lid)) continue;
      seenSource.add(lid);
      const layer = transcriptionLayers.find((l) => l.id === lid);
      if (!layer) continue;
      const pol = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
      next[lid] = computeFontSizeFromRenderPolicy(previewHeight, pol);
    }
    const groupTranslationLayers = filterTranslationLayersForComparisonGroup(
      group,
      translationLayers,
      transcriptionLayers,
      defaultTranscriptionLayerId,
      sourceLayer?.id,
      layerLinks,
    );
    for (const tl of groupTranslationLayers) {
      const tgtPol = resolveOrthographyRenderPolicy(tl.languageId, orthographies, tl.orthographyId);
      next[tl.id] = computeFontSizeFromRenderPolicy(previewHeight, tgtPol);
    }
    setComparisonResizeFontPreviewByLayerId((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length) {
        let same = true;
        for (const k of nextKeys) {
          if (prev[k] !== next[k]) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [defaultTranscriptionLayerId, displayStyleControl, groups, layerLinks, sourceLayer, transcriptionLayers, translationLayers]);

  const {
    resizingLayerId: resizingComparisonEditorId,
    startLaneHeightResize: startComparisonEditorResize,
  } = useTimelineLaneHeightResize(
    handleComparisonEditorLaneChange,
    handleComparisonEditorResizeEnd,
    handleComparisonEditorResizePreview,
  );

  const showBundleChips = orderedDistinctBundleKeys.length > 1 && comparisonBundleFilterRootId == null;
  const handleComparisonEditorResizeStart = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    groupId: string,
    currentHeight: number,
    edge: 'top' | 'bottom',
  ) => {
    startComparisonEditorResize(event, `comparison-editor:${groupId}`, currentHeight, edge);
  }, [startComparisonEditorResize]);
  const isComparisonEditorResizing = typeof resizingComparisonEditorId === 'string'
    && resizingComparisonEditorId.startsWith('comparison-editor:');
  const comparisonViewStyle = useMemo(() => ({
    '--timeline-comparison-left-grow': String(comparisonLeftGrow),
    '--timeline-comparison-right-grow': String(100 - comparisonLeftGrow),
    '--timeline-comparison-editor-min-height': `${defaultComparisonEditorHeight}px`,
  }) as CSSProperties, [comparisonLeftGrow, defaultComparisonEditorHeight]);

  const comparisonDualGridStyle = useMemo((): CSSProperties | undefined => {
    if (compactMode !== 'both' || isNarrowComparisonLayout) return undefined;
    return {
      gridTemplateColumns: `minmax(0, ${comparisonLeftGrow}fr) minmax(0, ${100 - comparisonLeftGrow}fr)`,
    };
  }, [compactMode, comparisonLeftGrow, isNarrowComparisonLayout]);

  useEffect(() => {
    if (!activeUnitId) return;

    const matchedGroup = groups.find((group) => (
      group.sourceItems.some((item) => item.unitId === activeUnitId)
      || group.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
    ));
    if (!matchedGroup) {
      patchComparisonFocus({
        activeComparisonGroupId: null,
        activeComparisonCellId: null,
        comparisonTargetSide: null,
        contextMenuSourceUnitId: null,
      });
      return;
    }

    if (!visibleGroups.some((g) => g.id === matchedGroup.id)) return;

    const syncedSide = translationLayers.some((l) => l.id === focusedLayerRowId) ? 'target' : 'source';
    const syncTranslationLayer = translationLayers.find((l) => l.id === focusedLayerRowId) ?? targetLayer;
    const targetCellIdForSync = syncedSide === 'target' && syncTranslationLayer
      ? (comparisonUsesSplitTargetEditors(matchedGroup)
        && syncTranslationLayer.id === targetLayer?.id
        && matchedGroup.targetItems[0]
        ? `target:${matchedGroup.id}:${syncTranslationLayer.id}:${matchedGroup.targetItems[0].id}`
        : `target:${matchedGroup.id}:${syncTranslationLayer.id}:editor`)
      : `source:${activeUnitId}`;
    patchComparisonFocus({
      activeComparisonGroupId: matchedGroup.id,
      activeComparisonCellId: targetCellIdForSync,
      comparisonTargetSide: syncedSide,
      contextMenuSourceUnitId: activeUnitId,
    });
  }, [activeUnitId, focusedLayerRowId, groups, patchComparisonFocus, targetLayer?.id, translationLayers, visibleGroups]);

  /** 波形/全局选中语段时，把对应对照组滚入 split-host 视口（tier 的横向 scroll 与对照纵向列表无关） */
  useLayoutEffect(() => {
    if (groups.length === 0) return;
    if (!activeUnitId) return;
    const host = comparisonSplitHostRef.current;
    if (!host) return;

    const matchedGroup = groups.find((group) => (
      group.sourceItems.some((item) => item.unitId === activeUnitId)
      || group.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
    ));
    if (!matchedGroup) return;

    if (!visibleGroups.some((g) => g.id === matchedGroup.id)) return;

    let targetEl: HTMLElement | null = null;
    for (const node of host.querySelectorAll('[data-comparison-group-id]')) {
      if (node instanceof HTMLElement && node.getAttribute('data-comparison-group-id') === matchedGroup.id) {
        targetEl = node;
        break;
      }
    }
    if (!targetEl) return;

    if (typeof targetEl.scrollIntoView === 'function') {
      /* start：避免 block:nearest 在嵌套滚动里误判「已可见」而不滚 */
      targetEl.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
    }
  }, [activeUnitId, groups, visibleGroups]);

  if (groups.length === 0) {
    return (
      <div
        className="timeline-comparison-view timeline-comparison-view-empty"
        role="status"
        aria-live="polite"
      >
        <p className="timeline-comparison-empty-hint">
          {translationLayers.length === 0
            ? t(locale, 'transcription.toolbar.comparisonRequiresTranslationLayer')
            : t(locale, 'transcription.comparison.emptyGroups')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={comparisonViewRef}
      className={`timeline-comparison-view${isComparisonColumnSplitDragging ? ' timeline-comparison-view-column-split-active' : ''}${isComparisonEditorResizing ? ' timeline-comparison-view-resizing' : ''}`}
      data-testid="timeline-comparison-view"
      data-compact-mode={compactMode}
      style={comparisonViewStyle}
    >
      <div className="timeline-comparison-workspace">
        <div className="timeline-comparison-toolbar">
          <div className="timeline-comparison-mode-toggle" role="group" aria-label={t(locale, 'transcription.comparison.columnMode')}>
            <button
              type="button"
              className={`timeline-comparison-mode-btn${compactMode === 'both' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'both'}
              onClick={() => setCompactMode('both')}
            >
              {t(locale, 'transcription.comparison.allColumns')}
            </button>
            <button
              type="button"
              className={`timeline-comparison-mode-btn${compactMode === 'source' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'source'}
              onClick={() => setCompactMode('source')}
            >
              {t(locale, 'transcription.comparison.sourceOnly')}
            </button>
            <button
              type="button"
              className={`timeline-comparison-mode-btn${compactMode === 'target' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'target'}
              onClick={() => setCompactMode('target')}
            >
              {t(locale, 'transcription.comparison.translationOnly')}
            </button>
          </div>
          {bundleFilterMenuItems.length > 0 ? (
            <div
              className="timeline-comparison-bundle-filter"
              role="group"
              aria-label={t(locale, 'transcription.comparison.bundleFilterGroupAria')}
            >
              <button
                type="button"
                className={`timeline-comparison-mode-btn timeline-comparison-bundle-filter-btn${comparisonBundleFilterRootId != null ? ' is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={layerContextMenu?.items === bundleFilterMenuItems}
                title={bundleFilterButtonTitle}
                aria-label={bundleFilterButtonTitle}
                data-testid="comparison-bundle-filter-btn"
                onClick={(event) => toggleComparisonMenuFromButton(event, bundleFilterMenuItems)}
              >
                {t(locale, 'transcription.comparison.bundleFilter')}
              </button>
            </div>
          ) : null}
          <div className="timeline-comparison-header-actions" role="group" aria-label={t(locale, 'transcription.comparison.columnMode')}>
            {sourceLayer ? (
              <button
                type="button"
                className={`timeline-comparison-mode-btn timeline-comparison-header-title-btn${focusedLayerRowId === sourceLayer.id ? ' is-active' : ''}`}
                title={sourceHeaderContent}
                aria-label={sourceHeaderContent}
                data-testid="comparison-layer-header-source"
                onClick={() => onFocusLayer(sourceLayer.id)}
                onContextMenu={(event) => openComparisonMenuAtPointer(event, comparisonHeaderMenuItems.source)}
              >
                {sourceHeaderContent}
              </button>
            ) : null}
            {headerTargetLayers.map((layer, index) => {
              const layerHeaderLabel = resolveComparisonLayerLabel(
                layer,
                locale,
                t(locale, 'transcription.comparison.translationHeader'),
              );
              const layerHeaderContent = resolveComparisonHeaderContentForLayer(layer, layerHeaderLabel);
              const targetHeaderTestId = index === 0
                ? 'comparison-layer-header-target'
                : `comparison-layer-header-target-${layer.id}`;
              return (
                <button
                  key={`comparison-target-header-${layer.id}`}
                  type="button"
                  className={`timeline-comparison-mode-btn timeline-comparison-header-title-btn${focusedLayerRowId === layer.id ? ' is-active' : ''}`}
                  title={layerHeaderContent}
                  aria-label={layerHeaderContent}
                  data-testid={targetHeaderTestId}
                  onClick={() => onFocusLayer(layer.id)}
                  onContextMenu={(event) => openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(layer, layerHeaderContent))}
                >
                  {layerHeaderContent}
                </button>
              );
            })}
          </div>
          <div className="timeline-comparison-toolbar-spacer" aria-hidden />
          {comparisonStyleMenuItems.length > 0 ? (
            <button
              type="button"
              className="timeline-comparison-mode-btn timeline-comparison-layer-style-btn"
              aria-haspopup="menu"
              aria-expanded={layerContextMenu?.items === comparisonStyleMenuItems}
              title={t(locale, 'transcription.comparison.layerDisplayStyles')}
              aria-label={t(locale, 'transcription.comparison.layerDisplayStyles')}
              onClick={(event) => toggleComparisonMenuFromButton(event, comparisonStyleMenuItems)}
            >
              {t(locale, 'transcription.comparison.layerDisplayStyles')}
            </button>
          ) : null}
        </div>
        <div ref={comparisonSplitHostRef} className="timeline-comparison-split-host">
          <div className="timeline-comparison-split-host-inner">
        <TranscriptionTimelineComparisonGroupList
          locale={locale}
          visibleGroups={visibleGroups}
          activeComparisonGroupId={activeComparisonGroupId}
          activeComparisonCellId={activeComparisonCellId}
          comparisonTargetSide={comparisonTargetSide}
          contextMenuSourceUnitId={contextMenuSourceUnitId}
          focusedLayerRowId={focusedLayerRowId}
          {...(activeUnitId !== undefined ? { activeUnitId } : {})}
          comparisonDualGridStyle={comparisonDualGridStyle}
          comparisonEditorHeightByGroup={comparisonEditorHeightByGroup}
          defaultComparisonEditorHeight={defaultComparisonEditorHeight}
          layerIdToHorizontalBundleRootId={layerIdToHorizontalBundleRootId}
          sourceLayer={sourceLayer}
          targetLayer={targetLayer}
          translationLayers={translationLayers}
          transcriptionLayers={transcriptionLayers}
          {...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {})}
          layerLinks={layerLinks}
          unitByIdForSpeaker={unitByIdForSpeaker}
          renderLaneLabel={renderLaneLabel}
          onFocusLayer={onFocusLayer}
          patchComparisonFocus={patchComparisonFocus}
          bundleOrdinalByKey={bundleOrdinalByKey}
          showBundleChips={showBundleChips}
          comparisonHeaderOrthographies={comparisonHeaderOrthographies}
          buildComparisonHeaderMenuItems={buildComparisonHeaderMenuItems}
          openComparisonMenuAtPointer={openComparisonMenuAtPointer}
          translationAudioByLayer={translationAudioByLayer}
          mediaItemById={mediaItemById}
          recording={recording}
          recordingUnitId={recordingUnitId}
          recordingLayerId={recordingLayerId}
          startRecordingForUnit={startRecordingForUnit}
          stopRecording={stopRecording}
          deleteVoiceTranslation={deleteVoiceTranslation}
          transcribeVoiceTranslation={transcribeVoiceTranslation}
          orthographies={displayStyleControl?.orthographies ?? []}
          resizingComparisonEditorId={resizingComparisonEditorId}
          comparisonResizeFontPreviewByLayerId={comparisonResizeFontPreviewByLayerId}
          handleComparisonEditorResizeStart={handleComparisonEditorResizeStart}
          translationDrafts={translationDrafts}
          setTranslationDrafts={setTranslationDrafts}
          translationTextByLayer={translationTextByLayer}
          unitDrafts={unitDrafts}
          setUnitDrafts={setUnitDrafts}
          focusedTranslationDraftKeyRef={focusedTranslationDraftKeyRef}
          saveStatusByCellKey={saveStatusByCellKey}
          setComparisonCellSaveStatus={setComparisonCellSaveStatus}
          runComparisonSaveWithStatus={runComparisonSaveWithStatus}
          scheduleAutoSave={scheduleAutoSave}
          clearAutoSaveTimer={clearAutoSaveTimer}
          persistGroupTranslation={persistGroupTranslation}
          persistComparisonTargetTranslation={persistComparisonTargetTranslation}
          persistSourceText={persistSourceText}
          getUnitTextForLayer={getUnitTextForLayer}
          segmentContentByLayer={segmentContentByLayer}
          segmentsByLayer={segmentsByLayer}
          resolveNoteIndicatorTarget={resolveNoteIndicatorTarget}
          resolveSelfCertaintyForUnit={resolveSelfCertaintyForUnit}
          resolveSelfCertaintyAmbiguityForUnit={resolveSelfCertaintyAmbiguityForUnit}
          handleNoteClick={handleNoteClick}
          handleAnnotationClick={handleAnnotationClick}
          handleAnnotationContextMenu={handleAnnotationContextMenu}
          navigateUnitFromInput={navigateUnitFromInput}
          speakerVisualByUnitId={stableSpeakerVisualByUnitId}
        />
        {compactMode === 'both' && !isNarrowComparisonLayout ? (
          <div
            className="timeline-comparison-global-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={comparisonLeftGrow}
            aria-label={t(locale, 'transcription.comparison.columnResizeSeparator')}
            onPointerDown={handleComparisonSplitterPointerDown}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              resetComparisonColumnsToEqualWidth();
            }}
          />
        ) : null}
          </div>
        </div>
      </div>
      {layerAction ? (
        <LayerActionPopover
          action={layerAction.action}
          layerId={layerAction.layerId}
          deletableLayers={effectiveDeletableLayers}
          {...(defaultLanguageId !== undefined ? { defaultLanguageId } : {})}
          {...(defaultOrthographyId !== undefined ? { defaultOrthographyId } : {})}
          createLayer={createLayer}
          {...(updateLayerMetadata !== undefined ? { updateLayerMetadata } : {})}
          deleteLayer={deleteLayer}
          {...(deleteLayerWithoutConfirm !== undefined ? { deleteLayerWithoutConfirm } : {})}
          {...(checkLayerHasContent !== undefined ? { checkLayerHasContent } : {})}
          onClose={() => setLayerAction(null)}
        />
      ) : null}
      <DeleteLayerConfirmDialog
        open={deleteLayerConfirm != null}
        layerName={deleteLayerConfirm?.layerName ?? ''}
        layerType={deleteLayerConfirm?.layerType ?? 'transcription'}
        textCount={deleteLayerConfirm?.textCount ?? 0}
        {...(deleteLayerConfirm?.warningMessage !== undefined ? { warningMessage: deleteLayerConfirm.warningMessage } : {})}
        keepUnits={deleteConfirmKeepUnits}
        onKeepUnitsChange={setDeleteConfirmKeepUnits}
        onCancel={cancelDeleteLayerConfirm}
        onConfirm={() => {
          void confirmDeleteLayer();
        }}
      />
      {layerContextMenu ? (
        <ContextMenu
          x={layerContextMenu.x}
          y={layerContextMenu.y}
          anchorOrigin={layerContextMenu.anchorOrigin ?? 'bottom-left'}
          items={layerContextMenu.items}
          onClose={() => setLayerContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
