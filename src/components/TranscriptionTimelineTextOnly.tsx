import type { LayerLinkDocType, LayerDocType, LayerDisplaySettings, LayerUnitContentDocType, LayerUnitDocType, MediaItemDocType, OrthographyDocType } from '../db';
import { memo, useCallback, useMemo, useState } from 'react';
import type { TimelineResizeDragOptions } from '../hooks/useTimelineResize';
import type { TextTimeMapping } from '../services/LinguisticService';
import { computeTextOnlyZoomPxPerDocSec, documentTimeFromTextOnlyTrackX, trackXFromDocumentTime } from '../utils/textOnlyTimelineTimeMapping';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { TimelineLaneHeader } from './TimelineLaneHeader';
import { LayerActionPopover } from './LayerActionPopover';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { DEFAULT_TIMELINE_LANE_HEIGHT, useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import { BASE_FONT_SIZE, computeFontSizeFromRenderPolicy, layerDisplaySettingsToStyle, resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import type { SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { unitToView, segmentToView, scopeTimelineUnitViewToLayer } from '../hooks/timelineUnitView';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { TranscriptionTimelineTextTranslationItem } from './TranscriptionTimelineTextTranslationItem';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { recordingScopeUnitId, resolveVoiceRecordingSourceUnit } from '../utils/recordingScopeUnitId';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { buildSegmentSpeakerLayoutMaps, EMPTY_OVERLAP_CYCLE_ITEMS_BY_UNIT_ID, EMPTY_SPEAKER_LAYOUT, normalizeSpeakerFocusKey, resolveSpeakerFocusKeyFromSegment } from './transcriptionTimelineSegmentSpeakerLayout';
import { t, tf, useLocale } from '../i18n';
import { SelfCertaintyIcon } from './SelfCertaintyIcon';
import { type UnitSelfCertainty } from '../utils/unitSelfCertainty';

function buildTextTimelineSelfCertaintyTitle(
  locale: Parameters<typeof t>[0],
  value: UnitSelfCertainty,
): string {
  const tier = value === 'certain'
    ? t(locale, 'transcription.unit.selfCertainty.certain')
    : value === 'uncertain'
      ? t(locale, 'transcription.unit.selfCertainty.uncertain')
      : t(locale, 'transcription.unit.selfCertainty.notUnderstood');
  return `${tier}\n${t(locale, 'transcription.unit.selfCertainty.dimensionHint')}`;
}

function buildTextTimelineSelfCertaintyAmbiguousTitle(
  locale: Parameters<typeof t>[0],
): string {
  return t(locale, 'transcription.unit.selfCertainty.ambiguousSource');
}

function resolveTextOnlyResizeTimingUnit(
  unit: TimelineUnitView,
  segmentLookupLayerId: string | undefined,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
  unitById: ReadonlyMap<string, LayerUnitDocType>,
): { id: string; startTime: number; endTime: number; mediaId?: string } {
  if (unit.kind === 'segment' && segmentLookupLayerId && segmentsByLayer) {
    const seg = segmentsByLayer.get(segmentLookupLayerId)?.find((s) => s.id === unit.id);
    if (seg) {
      const base = { id: seg.id, startTime: seg.startTime, endTime: seg.endTime };
      return typeof seg.mediaId === 'string' && seg.mediaId.length > 0 ? { ...base, mediaId: seg.mediaId } : base;
    }
  }
  const u = unitById.get(unit.id);
  if (u) {
    const base = { id: u.id, startTime: u.startTime, endTime: u.endTime };
    return typeof u.mediaId === 'string' && u.mediaId.length > 0 ? { ...base, mediaId: u.mediaId } : base;
  }
  const fallback = { id: unit.id, startTime: unit.startTime, endTime: unit.endTime };
  return typeof unit.mediaId === 'string' && unit.mediaId.length > 0
    ? { ...fallback, mediaId: unit.mediaId }
    : fallback;
}

function getSegmentTimelineItems(
  layer: LayerDocType,
  layerById: ReadonlyMap<string, LayerDocType>,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
  unitsOnCurrentMedia: LayerUnitDocType[],
  defaultTranscriptionLayerId?: string,
): ReadonlyArray<LayerUnitDocType | LayerUnitDocType> {
  const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
  if (!sourceLayer) {
    return unitsOnCurrentMedia;
  }

  return segmentsByLayer?.get(sourceLayer.id) ?? [];
}

type TranscriptionTimelineTextOnlyProps = {
  activeTextTimelineMode?: 'document' | 'media' | null;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  /** 当前媒体单元全集，用于语段 parentUnitId→宿主 解析（可宽于说话人过滤后的 unitsOnCurrentMedia） */
  segmentParentUnitLookup?: LayerUnitDocType[];
  segmentsByLayer?: Map<string, LayerUnitDocType[]>;
  segmentContentByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  selectedTimelineUnit?: TimelineUnit | null;
  flashLayerRowId: string;
  focusedLayerRowId: string;
  defaultTranscriptionLayerId?: string;
  logicalDurationSec?: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  createUnitFromSelection?: (start: number, end: number) => Promise<void>;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: Array<{ id: string; startTime: number }>,
  ) => void;
  handleAnnotationContextMenu?: (
    uttId: string,
    utt: TimelineUnitView,
    layerId: string,
    e: React.MouseEvent,
  ) => void;
  // TimelineLaneHeader props
  allLayersOrdered: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  onFocusLayer: (layerId: string) => void;
  navigateUnitFromInput: (e: React.KeyboardEvent<HTMLInputElement>, direction: -1 | 1) => void;
  layerLinks?: LayerLinkDocType[];
  showConnectors?: boolean;
  onToggleConnectors?: () => void;
  laneHeights: Record<string, number>;
  onLaneHeightChange: (layerId: string, nextHeight: number) => void;
  trackDisplayMode?: TranscriptionTrackDisplayMode;
  onToggleTrackDisplayMode?: () => void;
  onSetTrackDisplayMode?: (mode: TranscriptionTrackDisplayMode) => void;
  laneLockMap?: Record<string, number>;
  onLockSelectedSpeakersToLane?: (laneIndex: number) => void;
  onUnlockSelectedSpeakers?: () => void;
  onResetTrackAutoLayout?: () => void;
  selectedSpeakerNamesForLock?: string[];
  speakerLayerLayout?: SpeakerLayerLayoutResult;
  activeUnitId?: string;
  activeSpeakerFilterKey?: string;
  speakerVisualByUnitId?: Record<string, { name: string; color: string }>;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  // Lane label resize
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  mediaItems?: MediaItemDocType[];
  recording?: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  /** 层显示样式控制 | Layer display style control */
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof import('./LayerStyleSubmenu').buildLayerStyleMenuItems>[7];
  };
  /** 按句段/层解析自述确信度（与波形区标注一致的可选注入） */
  resolveSelfCertaintyForUnit?: (unitId: string, layerId?: string) => UnitSelfCertainty | undefined;
  resolveSelfCertaintyAmbiguityForUnit?: (unitId: string, layerId?: string) => boolean;
  /** 有声学 URL 但解码尚未就绪（壳层由 resolveTimelineShellMode 判定）| Acoustic URL present but decode not ready */
  acousticPending?: boolean;
  /** 与波形区相同的拖边改时；逻辑轴下由轨道宽度 / logicalDuration 推导 px/秒 | Edge drag timing edit (shared with waveform shell) */
  startTimelineResizeDrag?: (
    event: React.PointerEvent<HTMLElement>,
    unit: { id: string; mediaId?: string; startTime: number; endTime: number },
    edge: 'start' | 'end',
    layerId?: string,
    options?: TimelineResizeDragOptions,
  ) => void;
  /** 文献↔声学映射；拖建/改时按 `previewTextTimeMapping` 视口换算像素→文献秒 | Document↔real mapping for pointer→document time */
  textOnlyTimeMapping?: Pick<TextTimeMapping, 'offsetSec' | 'scale'> | null;
};

type LayerActionType =
  | 'create-transcription'
  | 'create-translation'
  | 'edit-transcription-metadata'
  | 'edit-translation-metadata'
  | 'delete';

type TextOnlyDragState = {
  layerId: string;
  pointerId: number;
  anchorX: number;
  currentX: number;
  trackWidth: number;
  startedOnInput: boolean;
};

type TextOnlyLaneLayoutItem = {
  index: number;
  size: number;
  start: number;
};

function buildTextOnlyLaneLayoutItems(input: {
  units: TimelineUnitView[];
  fallbackItems: TextOnlyLaneLayoutItem[];
  fallbackTotalSize: number;
  logicalDurationSec: number;
  timeMapping: Pick<TextTimeMapping, 'offsetSec' | 'scale'> | null | undefined;
  useStoredTimeLayout: boolean;
}): { items: TextOnlyLaneLayoutItem[]; totalSize: number } {
  const baseTotalSize = Math.max(input.fallbackTotalSize, input.units.length * 180, 1);
  if (!input.useStoredTimeLayout || input.units.length === 0 || !(input.logicalDurationSec > 0)) {
    return { items: input.fallbackItems, totalSize: baseTotalSize };
  }

  return {
    totalSize: baseTotalSize,
    items: input.units.map((unit, index) => {
      const safeStart = Number.isFinite(unit.startTime) ? Math.max(0, unit.startTime) : 0;
      const safeEnd = Number.isFinite(unit.endTime) ? Math.max(safeStart, unit.endTime) : safeStart;
      const start = Number(trackXFromDocumentTime(safeStart, baseTotalSize, input.logicalDurationSec, input.timeMapping).toFixed(3));
      const end = Number(trackXFromDocumentTime(safeEnd, baseTotalSize, input.logicalDurationSec, input.timeMapping).toFixed(3));
      return {
        index,
        start,
        size: Math.max(Number((end - start).toFixed(3)), 2),
      };
    }),
  };
}

export const TranscriptionTimelineTextOnly = memo(function TranscriptionTimelineTextOnly(
  props: TranscriptionTimelineTextOnlyProps,
) {
  // 从 props 对象读取，保证本地绑定存在（避免个别 HMR/打包路径下参数解构未生成绑定）
  const resolveSelfCertaintyForUnit = props.resolveSelfCertaintyForUnit;
  const resolveSelfCertaintyAmbiguityForUnit = props.resolveSelfCertaintyAmbiguityForUnit;
  const {
    activeTextTimelineMode,
    transcriptionLayers,
    unitsOnCurrentMedia,
    segmentParentUnitLookup,
    segmentsByLayer,
    segmentContentByLayer,
    saveSegmentContentForLayer,
    selectedTimelineUnit,
    flashLayerRowId,
    focusedLayerRowId,
    defaultTranscriptionLayerId,
    logicalDurationSec,
    scrollContainerRef,
    createUnitFromSelection,
    handleAnnotationClick,
    handleAnnotationContextMenu,
    allLayersOrdered,
    onReorderLayers,
    deletableLayers,
    defaultLanguageId,
    defaultOrthographyId,
    onFocusLayer,
    navigateUnitFromInput,
    layerLinks = [],
    showConnectors = true,
    onToggleConnectors,
    laneHeights,
    onLaneHeightChange,
    trackDisplayMode = 'single',
    onToggleTrackDisplayMode,
    onSetTrackDisplayMode,
    laneLockMap,
    onLockSelectedSpeakersToLane,
    onUnlockSelectedSpeakers,
    onResetTrackAutoLayout,
    selectedSpeakerNamesForLock,
    speakerLayerLayout = EMPTY_SPEAKER_LAYOUT,
    activeSpeakerFilterKey = 'all',
    speakerVisualByUnitId = {},
    speakerQuickActions,
    onLaneLabelWidthResize,
    translationAudioByLayer,
    mediaItems = [],
    recording = false,
    recordingUnitId = null,
    recordingLayerId = null,
    startRecordingForUnit,
    stopRecording,
    deleteVoiceTranslation,
    displayStyleControl,
    acousticPending = false,
    startTimelineResizeDrag,
    textOnlyTimeMapping,
  } = props;
  const locale = useLocale();

  const canUseLogicTimelineDragCreate = useMemo(
    () => Boolean(createUnitFromSelection)
      && (activeTextTimelineMode === 'document' || activeTextTimelineMode === 'media'),
    [createUnitFromSelection, activeTextTimelineMode],
  );
  const [layerAction, setLayerAction] = useState<{ action: LayerActionType; layerId?: string } | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [saveStatusByCellKey, setSaveStatusByCellKey] = useState<Record<string, 'dirty' | 'saving' | 'error'>>({});
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(new Set());
  const [previewFontSizeByLayerId, setPreviewFontSizeByLayerId] = useState<Record<string, number>>({});
  const [textOnlyDragState, setTextOnlyDragState] = useState<TextOnlyDragState | null>(null);

  const handleResizePreview = useCallback((layerId: string, previewHeight: number) => {
    if (!displayStyleControl) return;
    const layer = allLayersOrdered.find((candidate) => candidate.id === layerId);
    if (!layer) return;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, displayStyleControl.orthographies, layer.orthographyId);
    const previewFontSize = computeFontSizeFromRenderPolicy(previewHeight, renderPolicy);
    setPreviewFontSizeByLayerId((prev) => (
      prev[layerId] === previewFontSize ? prev : { ...prev, [layerId]: previewFontSize }
    ));
  }, [allLayersOrdered, displayStyleControl]);

  // 拖拽结束时反推字号 | Sync font size from lane height on resize end
  const handleResizeEnd = useCallback((layerId: string, finalHeight: number) => {
    setPreviewFontSizeByLayerId((prev) => {
      if (!(layerId in prev)) return prev;
      const next = { ...prev };
      delete next[layerId];
      return next;
    });
    if (!displayStyleControl) return;
    const layer = allLayersOrdered.find((l) => l.id === layerId);
    if (!layer) return;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, displayStyleControl.orthographies, layer.orthographyId);
    const newFontSize = computeFontSizeFromRenderPolicy(finalHeight, renderPolicy);
    const oldFontSize = layer.displaySettings?.fontSize ?? BASE_FONT_SIZE;
    if (Math.abs(newFontSize - oldFontSize) > 0.1) {
      displayStyleControl.onUpdate(layerId, { fontSize: newFontSize });
    }
  }, [allLayersOrdered, displayStyleControl]);

  const { resizingLayerId, startLaneHeightResize } = useTimelineLaneHeightResize(
    onLaneHeightChange,
    handleResizeEnd,
    handleResizePreview,
  );

  const toggleLayerCollapsed = useCallback((layerId: string) => {
    setCollapsedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  }, []);

  const {
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    renderLaneLabel,
    getUnitTextForLayer,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUnitText: saveUnitText,
    saveUnitLayerText: saveUnitLayerText,
    createLayer,
    updateLayerMetadata,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  } = useTranscriptionEditorContext();

  const {
    deleteLayerConfirm,
    deleteConfirmKeepUnits,
    setDeleteConfirmKeepUnits,
    requestDeleteLayer,
    cancelDeleteLayerConfirm,
    confirmDeleteLayer,
  } = useLayerDeleteConfirm({
    deletableLayers,
    checkLayerHasContent,
    deleteLayer,
    deleteLayerWithoutConfirm,
  });

  const horizontalVirtualizer = useVirtualizer({
    count: unitsOnCurrentMedia.length,
    horizontal: true,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 180,
    overscan: 10,
  });

  const virtualItems = horizontalVirtualizer.getVirtualItems();
  const totalSize = horizontalVirtualizer.getTotalSize();
  const unitById = useMemo(() => {
    const next = new Map(unitsOnCurrentMedia.map((item) => [item.id, item] as const));
    for (const u of segmentParentUnitLookup ?? []) {
      if (!next.has(u.id)) next.set(u.id, u);
    }
    return next;
  }, [unitsOnCurrentMedia, segmentParentUnitLookup]);
  const segmentById = useMemo(() => {
    const next = new Map<string, LayerUnitDocType>();
    if (!segmentsByLayer) return next;
    for (const list of segmentsByLayer.values()) {
      for (const s of list) {
        if (!next.has(s.id)) next.set(s.id, s);
      }
    }
    return next;
  }, [segmentsByLayer]);
  const layerById = useMemo(
    () => new Map(allLayersOrdered.map((layer) => [layer.id, layer] as const)),
    [allLayersOrdered],
  );
  const mediaItemById = useMemo(
    () => new Map(mediaItems.map((item) => [item.id, item] as const)),
    [mediaItems],
  );
  const { segmentSpeakerLayoutByLayer } = useMemo(() => buildSegmentSpeakerLayoutMaps({
    transcriptionLayers,
    layerById,
    unitById,
    segmentsByLayer,
    defaultTranscriptionLayerId,
    activeSpeakerFilterKey,
    trackDisplayMode,
    laneLockMap,
    speakerSortKeyById: undefined,
  }), [
    activeSpeakerFilterKey,
    defaultTranscriptionLayerId,
    laneLockMap,
    layerById,
    segmentsByLayer,
    trackDisplayMode,
    transcriptionLayers,
    unitById,
  ]);

  const resolvedLogicalDurationSec = useMemo(() => {
    if (typeof logicalDurationSec === 'number' && Number.isFinite(logicalDurationSec) && logicalDurationSec > 0) {
      return logicalDurationSec;
    }
    const mediaMaxEnd = unitsOnCurrentMedia.reduce((max, unit) => Math.max(max, unit.endTime ?? 0), 0);
    const segmentMaxEnd = segmentsByLayer
      ? Array.from(segmentsByLayer.values()).reduce((max, layerSegments) => (
          Math.max(max, ...layerSegments.map((segment) => segment.endTime ?? 0), 0)
        ), 0)
      : 0;
    return Math.max(mediaMaxEnd, segmentMaxEnd, 10);
  }, [logicalDurationSec, segmentsByLayer, unitsOnCurrentMedia]);

  const setCellSaveStatus = (cellKey: string, status?: 'dirty' | 'saving' | 'error') => {
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
  };

  const runSaveWithStatus = async (cellKey: string, saveTask: () => Promise<void>) => {
    setCellSaveStatus(cellKey, 'saving');
    try {
      await saveTask();
      setCellSaveStatus(cellKey);
    } catch (err) {
      console.error('[Jieyu] TranscriptionTimelineTextOnly: cell save failed', { cellKey, err });
      setCellSaveStatus(cellKey, 'error');
    }
  };

  const handleTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, layerId: string) => {
    if (!canUseLogicTimelineDragCreate) return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    const blockedTarget = target?.closest('button, [role="button"], .timeline-text-item-status-dot, .timeline-text-item-timing-resize-handle, .timeline-lane-resize-handle, .timeline-translation-audio-controls');
    if (blockedTarget) return;
    const startedOnInput = Boolean(target?.closest('input, textarea, [contenteditable="true"], .timeline-text-input'));
    if (startedOnInput) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const trackWidth = Math.max(rect.width, 1);
    const anchorX = Math.min(Math.max(event.clientX - rect.left, 0), trackWidth);
    setTextOnlyDragState({
      layerId,
      pointerId: event.pointerId,
      anchorX,
      currentX: anchorX,
      trackWidth,
      startedOnInput: false,
    });
    onFocusLayer(layerId);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // noop
      }
    }
    if (!startedOnInput) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [canUseLogicTimelineDragCreate, onFocusLayer]);

  const handleTrackPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>, layerId: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const trackWidth = Math.max(rect.width, 1);
    const currentX = Math.min(Math.max(event.clientX - rect.left, 0), trackWidth);
    const pointerId = event.pointerId;
    setTextOnlyDragState((prev) => {
      if (!prev || prev.layerId !== layerId || prev.pointerId !== pointerId) return prev;
      return { ...prev, currentX, trackWidth };
    });
  }, []);

  const clearTrackDragState = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    if (event && typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // noop
      }
    }
    setTextOnlyDragState(null);
  }, []);

  const handleTrackPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>, layerId: string) => {
    if (!canUseLogicTimelineDragCreate) {
      clearTrackDragState(event);
      return;
    }
    const drag = textOnlyDragState;
    if (!drag || drag.layerId !== layerId || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const trackWidth = Math.max(rect.width, drag.trackWidth, 1);
    const releaseX = Math.min(Math.max(event.clientX - rect.left, 0), trackWidth);
    const startX = Math.min(drag.anchorX, releaseX);
    const endX = Math.max(drag.anchorX, releaseX);
    clearTrackDragState(event);
    if (Math.abs(endX - startX) < 3) return;
    let start = Number(documentTimeFromTextOnlyTrackX(startX, trackWidth, resolvedLogicalDurationSec, textOnlyTimeMapping).toFixed(3));
    let end = Number(documentTimeFromTextOnlyTrackX(endX, trackWidth, resolvedLogicalDurationSec, textOnlyTimeMapping).toFixed(3));
    if (end < start) {
      const swap = start;
      start = end;
      end = swap;
    }
    if (end <= start || !createUnitFromSelection) return;
    fireAndForget(createUnitFromSelection(start, end));
    event.preventDefault();
    event.stopPropagation();
  }, [canUseLogicTimelineDragCreate, clearTrackDragState, createUnitFromSelection, resolvedLogicalDurationSec, textOnlyDragState, textOnlyTimeMapping]);

  return (
    <div className={`timeline-content timeline-content-text-only${editingCellKey ? ' timeline-content-editing' : ''}${acousticPending ? ' timeline-content-acoustic-pending' : ''}`}>
      {allLayersOrdered.map((layer, idx) => {
        if (layer.layerType === 'transcription') {
        const isCollapsed = collapsedLayerIds.has(layer.id);
        const segmentSourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
        const usesSegmentTimeline = Boolean(segmentSourceLayer);
        const segmentSourceLayerId = segmentSourceLayer?.id ?? '';
        const activeLayout = usesSegmentTimeline
          ? (segmentSpeakerLayoutByLayer.get(segmentSourceLayerId) ?? EMPTY_SPEAKER_LAYOUT)
          : speakerLayerLayout;
        const isMultiTrackMode = trackDisplayMode !== 'single';
        const rawLayerItems = usesSegmentTimeline
          ? (segmentsByLayer?.get(segmentSourceLayerId) ?? []).filter((segment) => (
              activeSpeakerFilterKey === 'all'
                || resolveSpeakerFocusKeyFromSegment(segment, unitById) === normalizeSpeakerFocusKey(activeSpeakerFilterKey)
            ))
          : unitsOnCurrentMedia;
        const layerUnits: TimelineUnitView[] = rawLayerItems.map((item) => (
          'layerId' in item
            ? scopeTimelineUnitViewToLayer(segmentToView(item, () => ''), layer.id)
            : unitToView(item, layer.id)
        ));
        const fallbackLaneVirtualItems: TextOnlyLaneLayoutItem[] = usesSegmentTimeline
          ? layerUnits.map((_, index) => ({ index, size: 180, start: index * 180 }))
          : virtualItems.map((it) => ({ index: it.index, size: it.size, start: it.start }));
        const fallbackLaneTotalSize = usesSegmentTimeline ? layerUnits.length * 180 : totalSize;
        const { items: laneVirtualItems, totalSize: laneTotalSize } = buildTextOnlyLaneLayoutItems({
          units: layerUnits,
          fallbackItems: fallbackLaneVirtualItems,
          fallbackTotalSize: fallbackLaneTotalSize,
          logicalDurationSec: resolvedLogicalDurationSec,
          timeMapping: textOnlyTimeMapping,
          useStoredTimeLayout: activeTextTimelineMode === 'document' || activeTextTimelineMode === 'media',
        });
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const layerIsSegmentBased = usesSegmentTimeline;
        const subTrackCount = layerIsSegmentBased && isMultiTrackMode
          ? activeLayout.subTrackCount
          : 1;
        const visibleLaneHeight = isCollapsed ? 14 : baseLaneHeight * subTrackCount;
        const previewFontSize = previewFontSizeByLayerId[layer.id];
        const displaySettingsForRender = previewFontSize == null
          ? layer.displaySettings
          : {
              ...layer.displaySettings,
              fontSize: previewFontSize,
            };
        const renderPolicy = displayStyleControl
          ? resolveOrthographyRenderPolicy(layer.languageId, displayStyleControl.orthographies, layer.orthographyId)
          : undefined;
        const overlapCycleItemsByUnitId = isMultiTrackMode
          ? (activeLayout.overlapCycleItemsByGroupId.get('__all__') ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UNIT_ID)
          : EMPTY_OVERLAP_CYCLE_ITEMS_BY_UNIT_ID;
        return (
        <TimelineStyledContainer
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-text-only ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''} ${layerIsSegmentBased && isMultiTrackMode && activeLayout.subTrackCount > 1 ? 'timeline-lane-speaker-layered' : ''}`}
          layoutStyle={{
            '--timeline-lane-height': `${visibleLaneHeight}px`,
            '--timeline-lane-content-height': `${Math.max(16, (baseLaneHeight - 12))}px`,
            '--timeline-subtrack-height': `${baseLaneHeight}px`,
            '--timeline-lane-track-width': `${laneTotalSize}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => {
            if (!isCollapsed) return;
            toggleLayerCollapsed(layer.id);
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            if (!onToggleTrackDisplayMode) return;
            if (e.target !== e.currentTarget) return;
            onToggleTrackDisplayMode();
          }}
        >
          <TimelineLaneHeader
            layer={layer}
            layerIndex={idx}
            activeTextTimelineMode={activeTextTimelineMode ?? null}
            allLayers={allLayersOrdered}
            onReorderLayers={onReorderLayers}
            deletableLayers={deletableLayers}
            onFocusLayer={onFocusLayer}
            renderLaneLabel={renderLaneLabel}
            onLayerAction={(action, layerId) => {
              if (action === 'delete' && layerId) {
                fireAndForget(requestDeleteLayer(layerId));
                return;
              }
              setLayerAction({ action, layerId });
            }}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? (() => {})}
            {...(speakerQuickActions && { speakerQuickActions })}
            {...(onToggleTrackDisplayMode && {
              trackModeControl: {
                mode: trackDisplayMode,
                onToggle: onToggleTrackDisplayMode,
                ...(onSetTrackDisplayMode ? { onSetMode: onSetTrackDisplayMode } : {}),
                ...(onLockSelectedSpeakersToLane ? { onLockSelectedToLane: onLockSelectedSpeakersToLane } : {}),
                ...(onUnlockSelectedSpeakers ? { onUnlockSelected: onUnlockSelectedSpeakers } : {}),
                ...(onResetTrackAutoLayout ? { onResetAuto: onResetTrackAutoLayout } : {}),
                ...(selectedSpeakerNamesForLock ? { selectedSpeakerNames: selectedSpeakerNamesForLock } : {}),
                ...(laneLockMap ? { lockedSpeakerCount: Object.keys(laneLockMap).length } : {}),
                ...(activeLayout.lockConflictCount > 0 ? { lockConflictCount: activeLayout.lockConflictCount } : {}),
              },
            })}
            isCollapsed={isCollapsed}
            onToggleCollapsed={toggleLayerCollapsed}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
            {...(displayStyleControl && { displayStyleControl })}
          />
          {!isCollapsed && <div
            className={`timeline-lane-text-only-track${canUseLogicTimelineDragCreate ? ' timeline-lane-text-only-track-creatable' : ''}${textOnlyDragState?.layerId === layer.id ? ' timeline-lane-text-only-track-marking' : ''}`}
            onPointerDown={(event) => handleTrackPointerDown(event, layer.id)}
            onPointerMove={(event) => handleTrackPointerMove(event, layer.id)}
            onPointerUp={(event) => handleTrackPointerUp(event, layer.id)}
            onPointerCancel={(event) => clearTrackDragState(event)}
          >
          {textOnlyDragState?.layerId === layer.id ? (
            <div
              className="timeline-text-only-drag-preview"
              style={{
                left: `${Math.min(textOnlyDragState.anchorX, textOnlyDragState.currentX)}px`,
                width: `${Math.max(Math.abs(textOnlyDragState.currentX - textOnlyDragState.anchorX), 2)}px`,
              }}
            />
          ) : null}
          {laneVirtualItems.map((virtualItem) => {
            const unit = layerUnits[virtualItem.index];
            if (!unit) return null;
            const realUtt = unitById.get(unit.id);
            const speakerVisual = speakerVisualByUnitId[unit.id];
            const sourceText = unit.kind === 'segment'
              ? (segmentContentByLayer?.get(layer.id)?.get(unit.id)?.text ?? '')
              : (realUtt ? getUnitTextForLayer(realUtt, layer.id) : unit.text);
            const draftKey = `trc-${layer.id}-${unit.id}`;
            const cellKey = `text-${layer.id}-${unit.id}`;
            const draft = unitDrafts[draftKey] ?? sourceText;
            const isEditing = editingCellKey === cellKey;
            const isDimmed = !!editingCellKey && !isEditing;
            const saveStatus = saveStatusByCellKey[cellKey];
            const retrySave = () => {
              if (draft === sourceText) {
                setCellSaveStatus(cellKey);
                return;
              }
              fireAndForget(runSaveWithStatus(cellKey, async () => {
                await saveUnitText(unit.id, draft, layer.id);
              }));
            };
            const isActive = selectedTimelineUnit?.layerId === layer.id
              && selectedTimelineUnit.unitId === unit.id;
            const subTrackIndex = unit.kind === 'segment' && isMultiTrackMode
              ? (activeLayout.placements.get(unit.id)?.subTrackIndex ?? 0)
              : 0;
            const conf = unit.ai_metadata?.confidence;
            const confidenceClass = typeof conf === 'number' && conf < 0.5
              ? ' timeline-text-item-confidence-low'
              : typeof conf === 'number' && conf >= 0.5 && conf < 0.75
                ? ' timeline-text-item-confidence-mid'
                : '';
            const uttForContext = unit;
            // 按当前显示 lane 取 badge，不能借用 source row 自带的 layerId；否则依附层会显示独立层的徽标。
            // Resolve certainty by the visible lane id, not the borrowed source row id, to prevent cross-lane leaks.
            const certaintyLookupLayerId = layer.id;
            // ⚠️ 禁止向宿主 unit 回退读 per-layer 字段（kind === 'segment' 时宿主在多层共享，
            // 会造成串层污染）。此处 kind === 'unit' 时宿主即自身，安全。
            // ⚠️ Guarded fallback: only when kind !== 'segment' (host unit is the row itself).
            const cellSelfCertainty = resolveSelfCertaintyForUnit?.(unit.id, certaintyLookupLayerId)
              ?? (unit.kind !== 'segment' ? realUtt?.selfCertainty : undefined);
            const cellSelfCertaintyAmbiguous = !cellSelfCertainty
              && resolveSelfCertaintyAmbiguityForUnit?.(unit.id, certaintyLookupLayerId) === true;
            const selfCertaintyTitle = cellSelfCertainty
              ? buildTextTimelineSelfCertaintyTitle(locale, cellSelfCertainty)
              : undefined;
            const selfCertaintyAmbiguousTitle = cellSelfCertaintyAmbiguous
              ? buildTextTimelineSelfCertaintyAmbiguousTitle(locale)
              : undefined;
            const trcAudioLayerSupports = layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio);
            const trcAudioScopeId = recordingScopeUnitId(unit);
            const trcAudioTranslation = translationAudioByLayer?.get(layer.id)?.get(trcAudioScopeId);
            const trcAudioMedia = trcAudioTranslation?.translationAudioMediaId
              ? mediaItemById.get(trcAudioTranslation.translationAudioMediaId)
              : undefined;
            const trcSourceUnit = resolveVoiceRecordingSourceUnit(unit, unitById, segmentById);
            const trcIsCurrentRecording = recording && recordingUnitId === trcAudioScopeId && recordingLayerId === layer.id;
            const trcAudioActionDisabled = recording && !trcIsCurrentRecording;
            const trcAudioControls = trcAudioLayerSupports && trcSourceUnit ? (
              <TimelineTranslationAudioControls
                isRecording={trcIsCurrentRecording}
                disabled={trcAudioActionDisabled}
                compact={layer.modality === 'mixed'}
                {...(trcAudioMedia ? { mediaItem: trcAudioMedia } : {})}
                onStartRecording={() => {
                  void startRecordingForUnit?.(trcSourceUnit, layer);
                }}
                {...(stopRecording ? { onStopRecording: stopRecording } : {})}
                {...(trcAudioMedia && deleteVoiceTranslation
                  ? { onDeleteRecording: () => deleteVoiceTranslation(trcSourceUnit, layer) }
                  : {})}
              />
            ) : null;
            const trcMixedOrAcceptsAudioTools = Boolean(trcAudioControls)
              && (layer.modality === 'mixed' || (layer.modality === 'text' && Boolean(layer.acceptsAudio)));
            return (
              <TimelineStyledContainer
                key={unit.id}
                className={`timeline-text-item${isActive ? ' timeline-text-item-active' : ''}${isEditing ? ' timeline-text-item-editing' : ''}${isDimmed ? ' timeline-text-item-dimmed' : ''}${!draft.trim() && !isEditing && layer.modality !== 'audio' ? ' timeline-text-item-empty' : ''}${saveStatus ? ` timeline-text-item-${saveStatus}` : ''}${confidenceClass}${speakerVisual ? ' timeline-text-item-has-speaker' : ''}${cellSelfCertainty || cellSelfCertaintyAmbiguous ? ' timeline-text-item-has-self-certainty' : ''}${trcMixedOrAcceptsAudioTools ? ' timeline-text-item-has-tools' : ''}${startTimelineResizeDrag ? ' timeline-text-item-timing-editable' : ''}`}
                layoutStyle={{
                  width: `${virtualItem.size}px`,
                  transform: `translateX(${virtualItem.start}px)`,
                  ...(unit.kind === 'segment' && isMultiTrackMode ? { top: subTrackIndex * baseLaneHeight, height: baseLaneHeight } : {}),
                  ...(speakerVisual ? ({ '--speaker-color': speakerVisual.color } as React.CSSProperties) : {}),
                  ...layerDisplaySettingsToStyle(displaySettingsForRender, renderPolicy),
                }}
                dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
                title={speakerVisual ? tf(locale, 'transcription.timeline.speakerTitle', { name: speakerVisual.name }) : undefined}
                onClick={(e) => handleAnnotationClick(unit.id, unit.startTime, layer.id, e, overlapCycleItemsByUnitId.get(unit.id))}
                onContextMenu={(e) => {
                  handleAnnotationContextMenu?.(unit.id, uttForContext, layer.id, e);
                }}
              >
                {speakerVisual && (
                  <span className="timeline-text-item-speaker-badge" title={tf(locale, 'transcription.timeline.speakerTitle', { name: speakerVisual.name })}>
                    {speakerVisual.name}
                  </span>
                )}
                {saveStatus === 'error' ? (
                  <button
                    type="button"
                    className="timeline-text-item-status-dot timeline-text-item-status-dot-error timeline-text-item-status-dot-action"
                    title={t(locale, 'transcription.timeline.save.retry')}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      retrySave();
                    }}
                  />
                ) : saveStatus ? (
                  <span
                    className={`timeline-text-item-status-dot timeline-text-item-status-dot-${saveStatus}`}
                    title={saveStatus === 'saving' ? t(locale, 'transcription.timeline.save.saving') : t(locale, 'transcription.timeline.save.unsaved')}
                  />
                ) : null}
                {trcMixedOrAcceptsAudioTools ? (
                  <div className="timeline-text-item-tools">{trcAudioControls}</div>
                ) : null}
                {layer.modality !== 'audio' && (
                <input
                  type="text"
                  className="timeline-text-input"
                  placeholder={unit.kind === 'segment' ? t(locale, 'transcription.timeline.placeholder.segment') : undefined}
                  value={draft}
                  dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
                  onContextMenu={(e) => {
                    handleAnnotationContextMenu?.(unit.id, uttForContext, layer.id, e);
                  }}
                  onFocus={() => {
                    setEditingCellKey(cellKey);
                    onFocusLayer(layer.id);
                  }}
                  onChange={(e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setUnitDrafts((prev) => ({ ...prev, [draftKey]: value }));
                    if (unit.kind === 'segment') {
                      if (!saveSegmentContentForLayer) return;
                      setCellSaveStatus(cellKey, 'dirty');
                      scheduleAutoSave(`seg-${layer.id}-${unit.id}`, async () => {
                        await runSaveWithStatus(cellKey, async () => {
                          await saveSegmentContentForLayer(unit.id, layer.id, value);
                        });
                      });
                      return;
                    }
                    if (value !== sourceText) {
                      setCellSaveStatus(cellKey, 'dirty');
                      scheduleAutoSave(`utt-${layer.id}-${unit.id}`, async () => {
                        await runSaveWithStatus(cellKey, async () => {
                          await saveUnitText(unit.id, value, layer.id);
                        });
                      });
                    } else {
                      clearAutoSaveTimer(`utt-${layer.id}-${unit.id}`);
                      setCellSaveStatus(cellKey);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Tab') {
                      navigateUnitFromInput(e, e.shiftKey ? -1 : 1);
                      return;
                    }
                    if (e.key === 'Enter') {
                      navigateUnitFromInput(e, e.shiftKey ? -1 : 1);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      clearAutoSaveTimer(`utt-${layer.id}-${unit.id}`);
                      setUnitDrafts((prev) => ({ ...prev, [draftKey]: sourceText }));
                      setCellSaveStatus(cellKey);
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => {
                    setEditingCellKey((prev) => (prev === cellKey ? null : prev));
                    const value = normalizeSingleLine(e.target.value);
                    if (unit.kind === 'segment') {
                      clearAutoSaveTimer(`seg-${layer.id}-${unit.id}`);
                      if (value !== sourceText && saveSegmentContentForLayer) {
                        fireAndForget(runSaveWithStatus(cellKey, async () => {
                          await saveSegmentContentForLayer(unit.id, layer.id, value);
                        }));
                      } else {
                        setCellSaveStatus(cellKey);
                      }
                      return;
                    }
                    clearAutoSaveTimer(`utt-${layer.id}-${unit.id}`);
                    if (value !== sourceText) {
                      fireAndForget(runSaveWithStatus(cellKey, async () => {
                        await saveUnitText(unit.id, value, layer.id);
                      }));
                    } else {
                      setCellSaveStatus(cellKey);
                    }
                  }}
                />
                )}
                {layer.modality === 'audio' && trcAudioControls ? (
                  <div className="timeline-translation-audio-card">{trcAudioControls}</div>
                ) : null}
                {startTimelineResizeDrag ? (
                  <>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      className="timeline-text-item-timing-resize-handle timeline-text-item-timing-resize-handle-start"
                      onPointerDown={(e) => {
                        const trackEl = (e.currentTarget as HTMLElement).closest('.timeline-lane-text-only-track') as HTMLElement | null;
                        const trackW = trackEl?.getBoundingClientRect().width ?? 0;
                        const zoomPxPerSec = computeTextOnlyZoomPxPerDocSec(trackW, resolvedLogicalDurationSec, textOnlyTimeMapping);
                        if (zoomPxPerSec === undefined) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const segmentLookupLayerId = usesSegmentTimeline && segmentSourceLayerId
                          ? segmentSourceLayerId
                          : undefined;
                        const timingUnit = resolveTextOnlyResizeTimingUnit(
                          unit,
                          segmentLookupLayerId,
                          segmentsByLayer,
                          unitById,
                        );
                        const resizeOpts: TimelineResizeDragOptions = { zoomPxPerSec };
                        if (segmentLookupLayerId) resizeOpts.segmentLookupLayerId = segmentLookupLayerId;
                        startTimelineResizeDrag(e, timingUnit, 'start', layer.id, resizeOpts);
                      }}
                    />
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      className="timeline-text-item-timing-resize-handle timeline-text-item-timing-resize-handle-end"
                      onPointerDown={(e) => {
                        const trackEl = (e.currentTarget as HTMLElement).closest('.timeline-lane-text-only-track') as HTMLElement | null;
                        const trackW = trackEl?.getBoundingClientRect().width ?? 0;
                        const zoomPxPerSec = computeTextOnlyZoomPxPerDocSec(trackW, resolvedLogicalDurationSec, textOnlyTimeMapping);
                        if (zoomPxPerSec === undefined) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const segmentLookupLayerId = usesSegmentTimeline && segmentSourceLayerId
                          ? segmentSourceLayerId
                          : undefined;
                        const timingUnit = resolveTextOnlyResizeTimingUnit(
                          unit,
                          segmentLookupLayerId,
                          segmentsByLayer,
                          unitById,
                        );
                        const resizeOpts: TimelineResizeDragOptions = { zoomPxPerSec };
                        if (segmentLookupLayerId) resizeOpts.segmentLookupLayerId = segmentLookupLayerId;
                        startTimelineResizeDrag(e, timingUnit, 'end', layer.id, resizeOpts);
                      }}
                    />
                  </>
                ) : null}
                {cellSelfCertainty && selfCertaintyTitle ? (
                  <SelfCertaintyIcon
                    certainty={cellSelfCertainty}
                    className="timeline-annotation-self-certainty"
                    title={selfCertaintyTitle}
                    ariaLabel={selfCertaintyTitle}
                  />
                ) : cellSelfCertaintyAmbiguous && selfCertaintyAmbiguousTitle ? (
                  <span
                    className="timeline-annotation-self-certainty timeline-annotation-self-certainty-ambiguous"
                    role="img"
                    aria-label={selfCertaintyAmbiguousTitle}
                    title={selfCertaintyAmbiguousTitle}
                  >
                    <span className="timeline-annotation-self-certainty-icon" aria-hidden>
                      !
                    </span>
                  </span>
                ) : null}
              </TimelineStyledContainer>
            );
          })}
          </div>}
          {!isCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}
            role="separator"
            aria-orientation="horizontal"
          />}
        </TimelineStyledContainer>
      );
        }

        const isCollapsed = collapsedLayerIds.has(layer.id);
        const usesOwnSegments = layerUsesOwnSegments(layer, defaultTranscriptionLayerId);
        const layerItems = getSegmentTimelineItems(
          layer,
          layerById,
          segmentsByLayer,
          unitsOnCurrentMedia,
          defaultTranscriptionLayerId,
        );
        const usesSegmentTimeline = layerItems !== unitsOnCurrentMedia;
        const layerUnits: TimelineUnitView[] = layerItems.map((item) => (
          'layerId' in item
            ? scopeTimelineUnitViewToLayer(segmentToView(item, () => ''), layer.id)
            : unitToView(item, layer.id)
        ));
        const fallbackLaneVirtualItems: TextOnlyLaneLayoutItem[] = usesSegmentTimeline
          ? layerUnits.map((_, index) => ({ index, size: 180, start: index * 180 }))
          : virtualItems.map((it) => ({ index: it.index, size: it.size, start: it.start }));
        const fallbackLaneTotalSize = usesSegmentTimeline ? layerUnits.length * 180 : totalSize;
        const { items: laneVirtualItems, totalSize: laneTotalSize } = buildTextOnlyLaneLayoutItems({
          units: layerUnits,
          fallbackItems: fallbackLaneVirtualItems,
          fallbackTotalSize: fallbackLaneTotalSize,
          logicalDurationSec: resolvedLogicalDurationSec,
          timeMapping: textOnlyTimeMapping,
          useStoredTimeLayout: activeTextTimelineMode === 'document' || activeTextTimelineMode === 'media',
        });
        const previewFontSize = previewFontSizeByLayerId[layer.id];
        const displaySettingsForRender = previewFontSize == null
          ? layer.displaySettings
          : {
              ...layer.displaySettings,
              fontSize: previewFontSize,
            };
        const renderPolicy = displayStyleControl
          ? resolveOrthographyRenderPolicy(layer.languageId, displayStyleControl.orthographies, layer.orthographyId)
          : undefined;
        return (
        <TimelineStyledContainer
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-text-only timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''}`}
          layoutStyle={{
            '--timeline-lane-height': `${isCollapsed ? 14 : (laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}px`,
            '--timeline-lane-content-height': `${Math.max(16, ((isCollapsed ? 14 : (laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)) - 12))}px`,
            '--timeline-lane-track-width': `${laneTotalSize}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => {
            if (!isCollapsed) return;
            toggleLayerCollapsed(layer.id);
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <TimelineLaneHeader
            layer={layer}
            layerIndex={idx}
            activeTextTimelineMode={activeTextTimelineMode ?? null}
            allLayers={allLayersOrdered}
            onReorderLayers={onReorderLayers}
            deletableLayers={deletableLayers}
            onFocusLayer={onFocusLayer}
            renderLaneLabel={renderLaneLabel}
            onLayerAction={(action, layerId) => {
              if (action === 'delete' && layerId) {
                fireAndForget(requestDeleteLayer(layerId));
                return;
              }
              setLayerAction({ action, layerId });
            }}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? (() => {})}
            isCollapsed={isCollapsed}
            onToggleCollapsed={toggleLayerCollapsed}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
            {...(displayStyleControl && { displayStyleControl })}
          />
          {!isCollapsed && <div className="timeline-lane-text-only-track">
          {laneVirtualItems.map((virtualItem) => {
            const unit = layerUnits[virtualItem.index];
            if (!unit) return null;
            const text = usesOwnSegments
              ? (segmentContentByLayer?.get(layer.id)?.get(unit.id)?.text ?? '')
              : (translationTextByLayer.get(layer.id)?.get(unit.id)?.text ?? '');
            const audioTranslation = translationAudioByLayer?.get(layer.id)?.get(recordingScopeUnitId(unit));
            const audioMedia = audioTranslation?.translationAudioMediaId
              ? mediaItemById.get(audioTranslation.translationAudioMediaId)
              : undefined;
            const draftKey = `${layer.id}-${unit.id}`;
            const cellKey = `tr-${layer.id}-${unit.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            const isEditing = editingCellKey === cellKey;
            const isDimmed = !!editingCellKey && !isEditing;
            const saveStatus = saveStatusByCellKey[cellKey];
            const isActive = selectedTimelineUnit?.layerId === layer.id
              && selectedTimelineUnit.unitId === unit.id;
            const translationOwnerUtt = resolveVoiceRecordingSourceUnit(unit, unitById, segmentById);
            // 这里也必须按显示层隔离，避免借来的 source segment layerId 把徽标带进依附翻译层。
            // Use the display lane scope here as well so borrowed source segment ids do not light up dependent rows.
            const certaintyLookupLayerId = layer.id;
            // ⚠️ 禁止向宿主 unit 回退读 selfCertainty（kind === 'segment' 时宿主在多层共享，
            // 回退读会让同一个 host unit 的 badge 串层显示）。kind === 'unit' 时宿主即自身，安全。
            // ⚠️ Do NOT fall back to host-unit selfCertainty when kind === 'segment'; the host is
            // shared across sibling layers and would surface cross-layer contamination.
            const trSelfCertainty = resolveSelfCertaintyForUnit?.(unit.id, certaintyLookupLayerId)
              ?? (unit.kind !== 'segment' ? translationOwnerUtt?.selfCertainty : undefined);
            const trSelfCertaintyAmbiguous = !trSelfCertainty
              && resolveSelfCertaintyAmbiguityForUnit?.(unit.id, certaintyLookupLayerId) === true;
            const trSelfCertaintyTitle = trSelfCertainty
              ? buildTextTimelineSelfCertaintyTitle(locale, trSelfCertainty)
              : undefined;
            const trSelfCertaintyAmbiguousTitle = trSelfCertaintyAmbiguous
              ? buildTextTimelineSelfCertaintyAmbiguousTitle(locale)
              : undefined;
            return (
              <TranscriptionTimelineTextTranslationItem
                key={unit.id}
                utt={unit}
                layer={layer}
                text={text}
                draft={draft}
                draftKey={draftKey}
                cellKey={cellKey}
                isActive={isActive}
                isEditing={isEditing}
                isDimmed={isDimmed}
                saveStatus={saveStatus}
                usesOwnSegments={usesOwnSegments}
                unitById={unitById}
                segmentById={segmentById}
                layoutStyle={{
                  width: `${virtualItem.size}px`,
                  transform: `translateX(${virtualItem.start}px)`,
                  ...layerDisplaySettingsToStyle(displaySettingsForRender, renderPolicy),
                }}
                dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
                audioMedia={audioMedia}
                recording={recording}
                recordingUnitId={recordingUnitId}
                recordingLayerId={recordingLayerId}
                startRecordingForUnit={startRecordingForUnit}
                stopRecording={stopRecording}
                deleteVoiceTranslation={deleteVoiceTranslation}
                saveSegmentContentForLayer={saveSegmentContentForLayer}
                saveUnitLayerText={saveUnitLayerText}
                scheduleAutoSave={scheduleAutoSave}
                clearAutoSaveTimer={clearAutoSaveTimer}
                setTranslationDrafts={setTranslationDrafts}
                setEditingCellKey={setEditingCellKey}
                setCellSaveStatus={setCellSaveStatus}
                runSaveWithStatus={runSaveWithStatus}
                focusedTranslationDraftKeyRef={focusedTranslationDraftKeyRef}
                onFocusLayer={onFocusLayer}
                navigateUnitFromInput={navigateUnitFromInput}
                handleAnnotationClick={handleAnnotationClick}
                handleAnnotationContextMenu={handleAnnotationContextMenu}
                {...(trSelfCertainty && trSelfCertaintyTitle
                  ? { selfCertainty: trSelfCertainty, selfCertaintyTitle: trSelfCertaintyTitle }
                  : {})}
                {...(trSelfCertaintyAmbiguous && trSelfCertaintyAmbiguousTitle
                  ? {
                      selfCertaintyAmbiguous: trSelfCertaintyAmbiguous,
                      selfCertaintyAmbiguousTitle: trSelfCertaintyAmbiguousTitle,
                    }
                  : {})}
              />
            );
          })}
          </div>}
          {!isCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}
            role="separator"
            aria-orientation="horizontal"
          />}
        </TimelineStyledContainer>
      );})}

      {layerAction && (
        <LayerActionPopover
          action={layerAction.action}
          layerId={layerAction.layerId}
          deletableLayers={deletableLayers}
          {...(defaultLanguageId !== undefined ? { defaultLanguageId } : {})}
          {...(defaultOrthographyId !== undefined ? { defaultOrthographyId } : {})}
          createLayer={createLayer}
          {...(updateLayerMetadata ? { updateLayerMetadata } : {})}
          deleteLayer={deleteLayer}
          deleteLayerWithoutConfirm={deleteLayerWithoutConfirm}
          checkLayerHasContent={checkLayerHasContent}
          onClose={() => setLayerAction(null)}
        />
      )}

      <DeleteLayerConfirmDialog
        open={deleteLayerConfirm !== null}
        layerName={deleteLayerConfirm?.layerName ?? ''}
        layerType={deleteLayerConfirm?.layerType ?? 'transcription'}
        textCount={deleteLayerConfirm?.textCount ?? 0}
        keepUnits={deleteConfirmKeepUnits}
        onKeepUnitsChange={setDeleteConfirmKeepUnits}
        onCancel={cancelDeleteLayerConfirm}
        onConfirm={() => { fireAndForget(confirmDeleteLayer()); }}
      />
    </div>
  );
});
