import '../styles/pages/timeline/timeline-paired-reading.css';
import type { LayerDocType } from '../db';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';
import { useToast } from '../contexts/ToastContext';
import { t, useLocale } from '../i18n';
import type { TranscriptionVerticalPaneFocusState } from '../pages/TranscriptionPage.UIState';
import { DEFAULT_TRANSCRIPTION_VERTICAL_PANE_FOCUS } from '../pages/TranscriptionPage.UIState';
import { type TimelineDraftSaveStatus } from './transcription/TimelineDraftEditorSurface';
import { TranscriptionTimelineVerticalViewGroupList } from './TranscriptionTimelineVerticalViewGroupList';
import {
  buildVerticalReadingGroups,
  pickTranslationSegmentForPersist,
  type VerticalReadingGroup,
  type PairedReadingTargetItem,
} from '../utils/transcriptionVerticalReadingGroups';
import { buildLayerBundles } from '../services/LayerOrderingService';
import {
  filterTranslationLayersForVerticalReadingGroup,
  pickTranslationLayerForVerticalReadingUnit,
} from '../utils/verticalReadingHostFilter';
import { useTranscriptionTimelineVerticalChrome } from '../hooks/useTranscriptionTimelineVerticalChrome';
import {
  BASE_FONT_SIZE,
  computeFontSizeFromRenderPolicy,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { LayerActionPopover } from './LayerActionPopover';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import { type LayerOperationActionType } from './layerOperationMenuItems';
import {
  PAIRED_READING_COLUMN_LEFT_GROW_KEY,
  PAIRED_READING_EDITOR_HEIGHT_STORAGE_KEY,
  PAIRED_READING_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX,
  accumulatedOffsetTopUntil,
  buildLayerIdToHorizontalBundleRootIdMap,
  verticalReadingUsesSplitTargetEditors,
  mergePairedReadingTimelineUnitById,
  readStoredPairedReadingEditorMinHeight,
  readStoredPairedReadingEditorHeightMap,
  readStoredPairedReadingColumnLeftGrow,
  resolvePairedReadingExplicitTargetItemsForLayer,
  resolveVerticalReadingGroupSourceUnits,
  resolvePairedReadingLayerLabel,
  resolvePairedReadingTargetPlainTextForLayer,
} from './transcriptionTimelineVerticalViewHelpers';
import { type PairedReadingCompactMode } from '../hooks/useTimelineVisibilityState';
import type { TranscriptionTimelineVerticalViewInput } from '../pages/transcriptionTimelineWorkspacePanelTypes';





type PairedReadingLayerActionType =
  Exclude<LayerOperationActionType, 'delete'>;

const EMPTY_SPEAKER_VISUAL_BY_UNIT_ID = Object.freeze({}) as Record<string, { name: string; color: string }>;




/**
 * 纵向对读壳（双列组块，P0）| Vertical paired-reading shell (two-column groups, P0)
 */
export function TranscriptionTimelineVerticalView({
  transcriptionLayers,
  translationLayers,
  layerLinks = [],
  unitsOnCurrentMedia,
  focusedLayerRowId,
  activeUnitId,
  onFocusLayer,
  verticalPaneFocus: verticalPaneFocusProp,
  updateVerticalPaneFocus,
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
}: TranscriptionTimelineVerticalViewInput) {
  const stableSpeakerVisualByUnitId = speakerVisualByUnitId ?? EMPTY_SPEAKER_VISUAL_BY_UNIT_ID;
  const locale = useLocale();
  const { showToast } = useToast();
  const [internalVerticalPaneFocus, setInternalVerticalPaneFocus] = useState<TranscriptionVerticalPaneFocusState>(
    () => ({ ...DEFAULT_TRANSCRIPTION_VERTICAL_PANE_FOCUS }),
  );
  const verticalPaneFocus = verticalPaneFocusProp != null && updateVerticalPaneFocus != null
    ? verticalPaneFocusProp
    : internalVerticalPaneFocus;
  const patchVerticalPaneFocus = useCallback((patch: Partial<TranscriptionVerticalPaneFocusState>) => {
    if (updateVerticalPaneFocus != null) {
      updateVerticalPaneFocus(patch);
    } else {
      setInternalVerticalPaneFocus((prev) => {
        const entries = Object.entries(patch) as Array<[
          keyof TranscriptionVerticalPaneFocusState,
          TranscriptionVerticalPaneFocusState[keyof TranscriptionVerticalPaneFocusState],
        ]>;
        if (entries.every(([key, value]) => prev[key] === value)) return prev;
        return { ...prev, ...patch };
      });
    }
  }, [updateVerticalPaneFocus]);
  const activeVerticalReadingGroupId = verticalPaneFocus.activeVerticalReadingGroupId;
  const activeVerticalReadingCellId = verticalPaneFocus.activeVerticalReadingCellId;
  const pairedReadingTargetSide = verticalPaneFocus.pairedReadingTargetSide;
  const contextMenuSourceUnitId = verticalPaneFocus.contextMenuSourceUnitId;
  const [compactMode, setCompactMode] = useState<PairedReadingCompactMode>('both');
  /** 按语段 rootUnitId 筛选对读组块；与侧栏「层树 bundle」无关 | Filter paired-reading rows by unit bundle root id */
  const [pairedReadingBundleFilterRootId, setPairedReadingBundleFilterRootId] = useState<string | null>(null);
  const [layerContextMenu, setLayerContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
    anchorOrigin?: 'top-left' | 'bottom-left';
  } | null>(null);
  const [layerAction, setLayerAction] = useState<{ action: PairedReadingLayerActionType; layerId: string | undefined } | null>(null);
  const [pairedReadingColumnLeftGrow, setPairedReadingColumnLeftGrow] = useState(readStoredPairedReadingColumnLeftGrow);
  const [pairedReadingEditorHeightByGroup, setPairedReadingEditorHeightByGroup] = useState<Record<string, number>>(readStoredPairedReadingEditorHeightMap);
  const [defaultPairedReadingEditorMinHeight] = useState(readStoredPairedReadingEditorMinHeight);
  const pairedReadingShellRef = useRef<HTMLDivElement | null>(null);
  const pairedReadingSplitHostRef = useRef<HTMLDivElement | null>(null);
  const pairedReadingColumnLeftGrowRef = useRef(pairedReadingColumnLeftGrow);
  const pairedReadingSplitDragRef = useRef<{ pointerId: number } | null>(null);
  const pairedReadingSplitPendingClientXRef = useRef<number | null>(null);
  const pairedReadingSplitDragRafRef = useRef<number | null>(null);
  const pairedReadingSplitCleanupRef = useRef<(() => void) | null>(null);
  const [isPairedReadingColumnSplitDragging, setIsPairedReadingColumnSplitDragging] = useState(false);

  useEffect(() => {
    pairedReadingColumnLeftGrowRef.current = pairedReadingColumnLeftGrow;
  }, [pairedReadingColumnLeftGrow]);

  const [isNarrowPairedReadingLayout, setIsNarrowPairedReadingLayout] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 960px)');
    const sync = () => setIsNarrowPairedReadingLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** 以首组左右列 getBoundingClientRect 为准，避免 %/滚动条与 fr 栅格亚像素漂移 | Measured gutter vs CSS calc drift */
  const pairedReadingSplitMeasureRef = useRef<{
    trackStartFromHostPaddingLeft: number;
    trackPx: number;
    gapPx: number;
  } | null>(null);

  const measurePairedReadingSplitLayout = useCallback(() => {
    const host = pairedReadingSplitHostRef.current;
    const clearSplitterLineTopVar = () => {
      const innerEl = host?.querySelector('.timeline-paired-reading-split-host-inner') as HTMLElement | null;
      innerEl?.style.removeProperty('--timeline-paired-reading-global-splitter-line-top');
    };
    if (!host || compactMode !== 'both' || isNarrowPairedReadingLayout) {
      clearSplitterLineTopVar();
      host?.style.removeProperty('--paired-reading-column-split-center-x');
      pairedReadingSplitMeasureRef.current = null;
      return;
    }
    const group = host.querySelector('.timeline-paired-reading-group') as HTMLElement | null;
    const src = group?.querySelector('.timeline-paired-reading-source-column') as HTMLElement | null;
    const tgt = group?.querySelector('.timeline-paired-reading-target-column') as HTMLElement | null;
    if (!group || !src || !tgt) {
      clearSplitterLineTopVar();
      host.style.removeProperty('--paired-reading-column-split-center-x');
      pairedReadingSplitMeasureRef.current = null;
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
    host.style.setProperty('--paired-reading-column-split-center-x', `${gapCenterFromHostPaddingLeft}px`);
    pairedReadingSplitMeasureRef.current = {
      trackStartFromHostPaddingLeft: sr.left - paddingLeftEdge,
      trackPx: Math.max(40, tr.right - sr.left),
      gapPx,
    };
    const inner = host.querySelector('.timeline-paired-reading-split-host-inner') as HTMLElement | null;
    const headerEl = host.querySelector('.timeline-paired-reading-header') as HTMLElement | null;
    if (inner && group) {
      const innerStyle = getComputedStyle(inner);
      const rowGap = parseFloat(innerStyle.rowGap || innerStyle.columnGap || innerStyle.gap || '8') || 8;
      const fromHeader = headerEl && headerEl.offsetHeight > 0 ? headerEl.offsetHeight + rowGap : 0;
      const fromFirstGroup = accumulatedOffsetTopUntil(group, inner);
      const layoutTop = Math.max(fromHeader, fromFirstGroup ?? 0);
      const lineTopPx = Math.max(0, Math.round(layoutTop + PAIRED_READING_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX));
      /* split-host-inner 顶 → 分割条命中区顶；无吸顶层头时 fromHeader 为 0，仅靠首组 offset */
      inner.style.setProperty('--timeline-paired-reading-global-splitter-line-top', `${lineTopPx}px`);
    }
  }, [compactMode, isNarrowPairedReadingLayout]);

  useEffect(() => () => {
    pairedReadingSplitCleanupRef.current?.();
    pairedReadingSplitCleanupRef.current = null;
    pairedReadingSplitDragRef.current = null;
    pairedReadingSplitPendingClientXRef.current = null;
    if (pairedReadingSplitDragRafRef.current != null) {
      cancelAnimationFrame(pairedReadingSplitDragRafRef.current);
      pairedReadingSplitDragRafRef.current = null;
    }
    document.body.style.userSelect = '';
  }, []);

  const resetPairedReadingColumnsToEqualWidth = useCallback(() => {
    if (compactMode !== 'both' || isNarrowPairedReadingLayout) return;
    setPairedReadingColumnLeftGrow(50);
    pairedReadingColumnLeftGrowRef.current = 50;
    try {
      localStorage.setItem(PAIRED_READING_COLUMN_LEFT_GROW_KEY, '50');
    } catch {
      /* ignore */
    }
  }, [compactMode, isNarrowPairedReadingLayout]);

  const handlePairedReadingColumnSplitPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (compactMode !== 'both' || isNarrowPairedReadingLayout) return;
    if (event.button !== 0) return;
    if (event.detail >= 2) {
      event.preventDefault();
      event.stopPropagation();
      resetPairedReadingColumnsToEqualWidth();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const host = pairedReadingSplitHostRef.current;
    if (!host) return;

    pairedReadingSplitCleanupRef.current?.();
    pairedReadingSplitCleanupRef.current = null;

    const pointerId = event.pointerId;
    pairedReadingSplitDragRef.current = { pointerId };

    const sidePad = 10;
    const columnInset = 10;
    const colGap = 8;

    const applyPairedReadingColumnSplitClientX = (clientX: number) => {
      measurePairedReadingSplitLayout();
      const m = pairedReadingSplitMeasureRef.current;
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
      pairedReadingColumnLeftGrowRef.current = next;
      setPairedReadingColumnLeftGrow(next);
    };

    const flushScheduledPairedReadingColumnSplit = () => {
      if (pairedReadingSplitDragRafRef.current != null) {
        cancelAnimationFrame(pairedReadingSplitDragRafRef.current);
        pairedReadingSplitDragRafRef.current = null;
      }
      const pending = pairedReadingSplitPendingClientXRef.current;
      pairedReadingSplitPendingClientXRef.current = null;
      if (pending != null) {
        applyPairedReadingColumnSplitClientX(pending);
      }
    };

    const schedulePairedReadingColumnSplitClientX = (clientX: number) => {
      pairedReadingSplitPendingClientXRef.current = clientX;
      if (pairedReadingSplitDragRafRef.current != null) return;
      pairedReadingSplitDragRafRef.current = requestAnimationFrame(() => {
        pairedReadingSplitDragRafRef.current = null;
        const pending = pairedReadingSplitPendingClientXRef.current;
        if (pending == null) return;
        applyPairedReadingColumnSplitClientX(pending);
      });
    };

    const onWindowPointerMove = (ev: PointerEvent) => {
      if (pairedReadingSplitDragRef.current?.pointerId !== ev.pointerId) return;
      schedulePairedReadingColumnSplitClientX(ev.clientX);
    };

    const finish = (ev: PointerEvent) => {
      if (pairedReadingSplitDragRef.current?.pointerId !== ev.pointerId) return;
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      pairedReadingSplitCleanupRef.current = null;
      pairedReadingSplitDragRef.current = null;
      flushScheduledPairedReadingColumnSplit();
      setIsPairedReadingColumnSplitDragging(false);
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(PAIRED_READING_COLUMN_LEFT_GROW_KEY, String(pairedReadingColumnLeftGrowRef.current));
      } catch {
        /* ignore */
      }
    };

    pairedReadingSplitCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (pairedReadingSplitDragRafRef.current != null) {
        cancelAnimationFrame(pairedReadingSplitDragRafRef.current);
        pairedReadingSplitDragRafRef.current = null;
      }
      pairedReadingSplitPendingClientXRef.current = null;
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    document.body.style.userSelect = 'none';
    setIsPairedReadingColumnSplitDragging(true);
    applyPairedReadingColumnSplitClientX(event.clientX);
  }, [compactMode, isNarrowPairedReadingLayout, measurePairedReadingSplitLayout, resetPairedReadingColumnsToEqualWidth]);

  const [saveStatusByCellKey, setSaveStatusByCellKey] = useState<Record<string, NonNullable<TimelineDraftSaveStatus>>>({});
  const setPairedReadingCellSaveStatus = useCallback((cellKey: string, status?: NonNullable<TimelineDraftSaveStatus>) => {
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
  const runPairedReadingSaveWithStatus = useCallback(async (cellKey: string, saveTask: () => Promise<void>) => {
    setPairedReadingCellSaveStatus(cellKey, 'saving');
    try {
      await saveTask();
      setPairedReadingCellSaveStatus(cellKey);
    } catch (err) {
      const blocked = err instanceof Error && err.message === 'PAIRED_READING_SEGMENT_PERSIST_BLOCKED';
      if (!blocked) {
        console.error('[Jieyu] TranscriptionTimelineVerticalView: cell save failed', { cellKey, err });
      }
      setPairedReadingCellSaveStatus(cellKey, 'error');
    }
  }, [setPairedReadingCellSaveStatus]);
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
    () => buildLayerIdToHorizontalBundleRootIdMap(effectiveAllLayersOrdered, layerLinks),
    [effectiveAllLayersOrdered, layerLinks],
  );
  const horizontalBundleRootIdsOrdered = useMemo(
    () => buildLayerBundles([...effectiveAllLayersOrdered], layerLinks).map((b) => b.root.id),
    [effectiveAllLayersOrdered, layerLinks],
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
    () => mergePairedReadingTimelineUnitById(unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer),
    [unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer],
  );

  const pairedReadingGroupSourceUnits = useMemo(
    () => resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers,
      translationLayers,
      layerLinks,
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
      layerLinks,
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
  const pairedReadingUsesSegmentSourceRows = useMemo(
    () => transcriptionLayers.some(
      (l) => layerUsesOwnSegments(l, defaultTranscriptionLayerId),
    ),
    [transcriptionLayers, defaultTranscriptionLayerId],
  );

  const groups = useMemo(() => {
    const disableMergeForGrouping = pairedReadingUsesSegmentSourceRows || translationLayers.length > 1;
    return buildVerticalReadingGroups({
      units: pairedReadingGroupSourceUnits,
      ...(disableMergeForGrouping ? { maxMergeGapSec: -1 } : {}),
      sourceLayerIds: transcriptionLayers.map((layer) => layer.id),
      getSourceText: (unit) => {
        const layerId = (typeof unit.layerId === 'string' && unit.layerId.trim()) || sourceLayer?.id;
        return getUnitTextForLayer(unit, layerId) || getUnitTextForLayer(unit) || '';
      },
      getTargetText: (unit) => {
        const tPick = pickTranslationLayerForVerticalReadingUnit(
          unit,
          translationLayers,
          targetLayer,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          layerLinks,
        );
        if (!tPick) return '';
        return resolvePairedReadingTargetPlainTextForLayer(
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
        const tPick = pickTranslationLayerForVerticalReadingUnit(
          unit,
          translationLayers,
          targetLayer,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          layerLinks,
        );
        if (!tPick) return undefined;
        return resolvePairedReadingExplicitTargetItemsForLayer(
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
    pairedReadingUsesSegmentSourceRows,
    pairedReadingGroupSourceUnits,
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
    measurePairedReadingSplitLayout();
    const host = pairedReadingSplitHostRef.current;
    if (!host) return;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          measurePairedReadingSplitLayout();
        })
      : null;
    ro?.observe(host);
    const headerEl = host.querySelector('.timeline-paired-reading-header') as HTMLElement | null;
    const innerEl = host.querySelector('.timeline-paired-reading-split-host-inner') as HTMLElement | null;
    if (headerEl) ro?.observe(headerEl);
    if (innerEl) ro?.observe(innerEl);
    window.addEventListener('resize', measurePairedReadingSplitLayout);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measurePairedReadingSplitLayout);
    };
  }, [groups.length, pairedReadingColumnLeftGrow, measurePairedReadingSplitLayout, compactMode, isNarrowPairedReadingLayout]);

  const persistGroupTranslation = useCallback(async (
    persistLayer: LayerDocType,
    group: VerticalReadingGroup,
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
      const hint = t(locale, 'transcription.pairedReading.segmentMissingForSave');
      showToast(hint, 'error', 8000);
      throw new Error('PAIRED_READING_SEGMENT_PERSIST_BLOCKED');
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

  const persistPairedReadingTargetTranslation = useCallback(async (
    persistLayer: LayerDocType,
    targetItem: PairedReadingTargetItem,
    group: VerticalReadingGroup,
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
    pairedReadingHeaderOrthographies,
    resolvePairedReadingHeaderContentForLayer,
    headerTargetLayers,
    pairedReadingLayerStyleMenuItems,
    buildPairedReadingLayerHeaderMenuItems,
    pairedReadingHeaderMenuItems,
    openPairedReadingMenuAtPointer,
    togglePairedReadingMenuFromButton,
  } = useTranscriptionTimelineVerticalChrome({
    locale,
    groups,
    activeVerticalReadingGroupId,
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
    pairedReadingBundleFilterRootId,
    setPairedReadingBundleFilterRootId,
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


  const [pairedReadingResizeFontPreviewByLayerId, setPairedReadingResizeFontPreviewByLayerId] = useState<Record<string, number>>({});

  const handlePairedReadingEditorLaneChange = useCallback((groupKey: string, nextHeight: number) => {
    setPairedReadingEditorHeightByGroup((prev) => {
      if (prev[groupKey] === nextHeight) return prev;
      return { ...prev, [groupKey]: nextHeight };
    });
  }, []);

  const handlePairedReadingEditorResizeEnd = useCallback((groupKey: string, finalHeight: number) => {
    setPairedReadingResizeFontPreviewByLayerId({});
    setPairedReadingEditorHeightByGroup((prev) => {
      const next = prev[groupKey] === finalHeight ? prev : { ...prev, [groupKey]: finalHeight };
      try {
        localStorage.setItem(PAIRED_READING_EDITOR_HEIGHT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    if (!displayStyleControl || !groupKey.startsWith('paired-reading-editor:')) return;
    const groupId = groupKey.slice('paired-reading-editor:'.length);
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
    const groupTranslationLayers = filterTranslationLayersForVerticalReadingGroup(
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

  const handlePairedReadingEditorResizePreview = useCallback((layerKey: string, previewHeight: number) => {
    if (!displayStyleControl) return;
    if (!layerKey.startsWith('paired-reading-editor:')) return;
    const groupId = layerKey.slice('paired-reading-editor:'.length);
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
    const groupTranslationLayers = filterTranslationLayersForVerticalReadingGroup(
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
    setPairedReadingResizeFontPreviewByLayerId((prev) => {
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
    resizingLayerId: resizingPairedReadingEditorId,
    startLaneHeightResize: startPairedReadingEditorLaneResize,
  } = useTimelineLaneHeightResize(
    handlePairedReadingEditorLaneChange,
    handlePairedReadingEditorResizeEnd,
    handlePairedReadingEditorResizePreview,
  );

  const showBundleChips = orderedDistinctBundleKeys.length > 1 && pairedReadingBundleFilterRootId == null;
  const handlePairedReadingEditorResizeStart = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    groupId: string,
    currentHeight: number,
    edge: 'top' | 'bottom',
  ) => {
    startPairedReadingEditorLaneResize(event, `paired-reading-editor:${groupId}`, currentHeight, edge);
  }, [startPairedReadingEditorLaneResize]);
  const isPairedReadingEditorResizing = typeof resizingPairedReadingEditorId === 'string'
    && resizingPairedReadingEditorId.startsWith('paired-reading-editor:');
  const pairedReadingShellStyle = useMemo(() => ({
    '--timeline-paired-reading-left-grow': String(pairedReadingColumnLeftGrow),
    '--timeline-paired-reading-right-grow': String(100 - pairedReadingColumnLeftGrow),
    '--timeline-paired-reading-editor-min-height': `${defaultPairedReadingEditorMinHeight}px`,
  }) as CSSProperties, [pairedReadingColumnLeftGrow, defaultPairedReadingEditorMinHeight]);

  const pairedReadingDualGridStyle = useMemo((): CSSProperties | undefined => {
    if (compactMode !== 'both' || isNarrowPairedReadingLayout) return undefined;
    return {
      gridTemplateColumns: `minmax(0, ${pairedReadingColumnLeftGrow}fr) minmax(0, ${100 - pairedReadingColumnLeftGrow}fr)`,
    };
  }, [compactMode, pairedReadingColumnLeftGrow, isNarrowPairedReadingLayout]);

  useEffect(() => {
    if (!activeUnitId) return;

    const matchedGroup = groups.find((group) => (
      group.sourceItems.some((item) => item.unitId === activeUnitId)
      || group.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
    ));
    if (!matchedGroup) {
      patchVerticalPaneFocus({
        activeVerticalReadingGroupId: null,
        activeVerticalReadingCellId: null,
        pairedReadingTargetSide: null,
        contextMenuSourceUnitId: null,
      });
      return;
    }

    if (!visibleGroups.some((g) => g.id === matchedGroup.id)) return;

    const syncedSide = translationLayers.some((l) => l.id === focusedLayerRowId) ? 'target' : 'source';
    const syncTranslationLayer = translationLayers.find((l) => l.id === focusedLayerRowId) ?? targetLayer;
    const targetCellIdForSync = syncedSide === 'target' && syncTranslationLayer
      ? (verticalReadingUsesSplitTargetEditors(matchedGroup)
        && syncTranslationLayer.id === targetLayer?.id
        && matchedGroup.targetItems[0]
        ? `target:${matchedGroup.id}:${syncTranslationLayer.id}:${matchedGroup.targetItems[0].id}`
        : `target:${matchedGroup.id}:${syncTranslationLayer.id}:editor`)
      : `source:${activeUnitId}`;
    patchVerticalPaneFocus({
      activeVerticalReadingGroupId: matchedGroup.id,
      activeVerticalReadingCellId: targetCellIdForSync,
      pairedReadingTargetSide: syncedSide,
      contextMenuSourceUnitId: activeUnitId,
    });
  }, [activeUnitId, focusedLayerRowId, groups, patchVerticalPaneFocus, targetLayer?.id, translationLayers, visibleGroups]);

  /** 波形/全局选中语段时，把对应对照组滚入 split-host 视口（tier 的横向 scroll 与对照纵向列表无关） */
  useLayoutEffect(() => {
    if (groups.length === 0) return;
    if (!activeUnitId) return;
    const host = pairedReadingSplitHostRef.current;
    if (!host) return;

    const matchedGroup = groups.find((group) => (
      group.sourceItems.some((item) => item.unitId === activeUnitId)
      || group.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
    ));
    if (!matchedGroup) return;

    if (!visibleGroups.some((g) => g.id === matchedGroup.id)) return;

    let targetEl: HTMLElement | null = null;
    for (const node of host.querySelectorAll('[data-paired-reading-group-id]')) {
      if (node instanceof HTMLElement && node.getAttribute('data-paired-reading-group-id') === matchedGroup.id) {
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
        className="timeline-paired-reading-view timeline-paired-reading-view-empty"
        role="status"
        aria-live="polite"
      >
        <p className="timeline-paired-reading-empty-hint">
          {translationLayers.length === 0
            ? t(locale, 'transcription.toolbar.verticalViewRequiresTranslationLayer')
            : t(locale, 'transcription.pairedReading.emptyGroups')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={pairedReadingShellRef}
      className={`timeline-paired-reading-view${isPairedReadingColumnSplitDragging ? ' timeline-paired-reading-view-column-split-active' : ''}${isPairedReadingEditorResizing ? ' timeline-paired-reading-view-resizing' : ''}`}
      data-testid="timeline-paired-reading-view"
      data-compact-mode={compactMode}
      style={pairedReadingShellStyle}
    >
      <div className="timeline-paired-reading-workspace">
        <div className="timeline-paired-reading-toolbar">
          <div className="timeline-paired-reading-mode-toggle" role="group" aria-label={t(locale, 'transcription.pairedReading.columnMode')}>
            <button
              type="button"
              className={`timeline-paired-reading-mode-btn${compactMode === 'both' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'both'}
              onClick={() => setCompactMode('both')}
            >
              {t(locale, 'transcription.pairedReading.allColumns')}
            </button>
            <button
              type="button"
              className={`timeline-paired-reading-mode-btn${compactMode === 'source' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'source'}
              onClick={() => setCompactMode('source')}
            >
              {t(locale, 'transcription.pairedReading.sourceOnly')}
            </button>
            <button
              type="button"
              className={`timeline-paired-reading-mode-btn${compactMode === 'target' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'target'}
              onClick={() => setCompactMode('target')}
            >
              {t(locale, 'transcription.pairedReading.translationOnly')}
            </button>
          </div>
          {bundleFilterMenuItems.length > 0 ? (
            <div
              className="timeline-paired-reading-bundle-filter"
              role="group"
              aria-label={t(locale, 'transcription.pairedReading.bundleFilterGroupAria')}
            >
              <button
                type="button"
                className={`timeline-paired-reading-mode-btn timeline-paired-reading-bundle-filter-btn${pairedReadingBundleFilterRootId != null ? ' is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={layerContextMenu?.items === bundleFilterMenuItems}
                title={bundleFilterButtonTitle}
                aria-label={bundleFilterButtonTitle}
                data-testid="paired-reading-bundle-filter-btn"
                onClick={(event) => togglePairedReadingMenuFromButton(event, bundleFilterMenuItems)}
              >
                {t(locale, 'transcription.pairedReading.bundleFilter')}
              </button>
            </div>
          ) : null}
          <div className="timeline-paired-reading-header-actions" role="group" aria-label={t(locale, 'transcription.pairedReading.columnMode')}>
            {sourceLayer ? (
              <button
                type="button"
                className={`timeline-paired-reading-mode-btn timeline-paired-reading-header-title-btn${focusedLayerRowId === sourceLayer.id ? ' is-active' : ''}`}
                title={sourceHeaderContent}
                aria-label={sourceHeaderContent}
                data-testid="paired-reading-layer-header-source"
                onClick={() => onFocusLayer(sourceLayer.id)}
                onContextMenu={(event) => openPairedReadingMenuAtPointer(event, pairedReadingHeaderMenuItems.source)}
              >
                {sourceHeaderContent}
              </button>
            ) : null}
            {headerTargetLayers.map((layer, index) => {
              const layerHeaderLabel = resolvePairedReadingLayerLabel(
                layer,
                locale,
                t(locale, 'transcription.pairedReading.translationHeader'),
              );
              const layerHeaderContent = resolvePairedReadingHeaderContentForLayer(layer, layerHeaderLabel);
              const targetHeaderTestId = index === 0
                ? 'paired-reading-layer-header-target'
                : `paired-reading-layer-header-target-${layer.id}`;
              return (
                <button
                  key={`paired-reading-target-header-${layer.id}`}
                  type="button"
                  className={`timeline-paired-reading-mode-btn timeline-paired-reading-header-title-btn${focusedLayerRowId === layer.id ? ' is-active' : ''}`}
                  title={layerHeaderContent}
                  aria-label={layerHeaderContent}
                  data-testid={targetHeaderTestId}
                  onClick={() => onFocusLayer(layer.id)}
                  onContextMenu={(event) => openPairedReadingMenuAtPointer(event, buildPairedReadingLayerHeaderMenuItems(layer, layerHeaderContent))}
                >
                  {layerHeaderContent}
                </button>
              );
            })}
          </div>
          <div className="timeline-paired-reading-toolbar-spacer" aria-hidden />
          {pairedReadingLayerStyleMenuItems.length > 0 ? (
            <button
              type="button"
              className="timeline-paired-reading-mode-btn timeline-paired-reading-layer-style-btn"
              aria-haspopup="menu"
              aria-expanded={layerContextMenu?.items === pairedReadingLayerStyleMenuItems}
              title={t(locale, 'transcription.pairedReading.layerDisplayStyles')}
              aria-label={t(locale, 'transcription.pairedReading.layerDisplayStyles')}
              onClick={(event) => togglePairedReadingMenuFromButton(event, pairedReadingLayerStyleMenuItems)}
            >
              {t(locale, 'transcription.pairedReading.layerDisplayStyles')}
            </button>
          ) : null}
        </div>
        <div ref={pairedReadingSplitHostRef} className="timeline-paired-reading-split-host">
          <div className="timeline-paired-reading-split-host-inner">
        <TranscriptionTimelineVerticalViewGroupList
          locale={locale}
          visibleGroups={visibleGroups}
          activeVerticalReadingGroupId={activeVerticalReadingGroupId}
          activeVerticalReadingCellId={activeVerticalReadingCellId}
          pairedReadingTargetSide={pairedReadingTargetSide}
          contextMenuSourceUnitId={contextMenuSourceUnitId}
          focusedLayerRowId={focusedLayerRowId}
          {...(activeUnitId !== undefined ? { activeUnitId } : {})}
          pairedReadingDualGridStyle={pairedReadingDualGridStyle}
          pairedReadingEditorHeightByGroup={pairedReadingEditorHeightByGroup}
          defaultPairedReadingEditorMinHeight={defaultPairedReadingEditorMinHeight}
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
          patchVerticalPaneFocus={patchVerticalPaneFocus}
          bundleOrdinalByKey={bundleOrdinalByKey}
          showBundleChips={showBundleChips}
          pairedReadingHeaderOrthographies={pairedReadingHeaderOrthographies}
          buildPairedReadingLayerHeaderMenuItems={buildPairedReadingLayerHeaderMenuItems}
          openPairedReadingMenuAtPointer={openPairedReadingMenuAtPointer}
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
          resizingPairedReadingEditorId={resizingPairedReadingEditorId}
          pairedReadingResizeFontPreviewByLayerId={pairedReadingResizeFontPreviewByLayerId}
          handlePairedReadingEditorResizeStart={handlePairedReadingEditorResizeStart}
          translationDrafts={translationDrafts}
          setTranslationDrafts={setTranslationDrafts}
          translationTextByLayer={translationTextByLayer}
          unitDrafts={unitDrafts}
          setUnitDrafts={setUnitDrafts}
          focusedTranslationDraftKeyRef={focusedTranslationDraftKeyRef}
          saveStatusByCellKey={saveStatusByCellKey}
          setPairedReadingCellSaveStatus={setPairedReadingCellSaveStatus}
          runPairedReadingSaveWithStatus={runPairedReadingSaveWithStatus}
          scheduleAutoSave={scheduleAutoSave}
          clearAutoSaveTimer={clearAutoSaveTimer}
          persistGroupTranslation={persistGroupTranslation}
          persistPairedReadingTargetTranslation={persistPairedReadingTargetTranslation}
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
        {compactMode === 'both' && !isNarrowPairedReadingLayout ? (
          <div
            className="timeline-paired-reading-global-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={pairedReadingColumnLeftGrow}
            aria-label={t(locale, 'transcription.pairedReading.columnResizeSeparator')}
            onPointerDown={handlePairedReadingColumnSplitPointerDown}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              resetPairedReadingColumnsToEqualWidth();
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
          layerLinks={layerLinks}
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
