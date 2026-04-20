import type { LayerLinkDocType, LayerDocType, LayerDisplaySettings, LayerUnitContentDocType, LayerUnitDocType, MediaItemDocType, OrthographyDocType } from '../db';
import { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { fireAndForget } from '../utils/fireAndForget';
import { TimelineLaneHeader } from './TimelineLaneHeader';
import { LayerActionPopover } from './LayerActionPopover';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { DEFAULT_TIMELINE_LANE_HEIGHT, useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';
import { t, useLocale } from '../i18n';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import { buildSpeakerLayerLayoutWithOptions, type SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';
import { recordingScopeUnitId } from '../utils/recordingScopeUnitId';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { unitToView, segmentToView, scopeTimelineUnitViewToLayer, type TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import { TranscriptionTimelineMediaTranslationRow } from './TranscriptionTimelineMediaTranslationRow';
import { TranscriptionTimelineMediaTranscriptionLane } from './TranscriptionTimelineMediaTranscriptionLane';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { buildSegmentSpeakerLayoutMaps, EMPTY_OVERLAP_CYCLE_ITEMS_BY_UNIT_ID, EMPTY_SPEAKER_LAYOUT, normalizeSpeakerFocusKey, resolveSpeakerFocusKeyFromSegment } from './transcriptionTimelineSegmentSpeakerLayout';
import type { LayerOperationActionType } from './layerOperationMenuItems';
import { useCollapsedLayerIds } from '../hooks/useTimelineVisibilityState';
import { listSegmentTimelineUnitsForLayer } from '../utils/timelineLaneSegmentIteration';
import { useTimelineLaneDisplayStyleResizePreview } from '../hooks/useTimelineLaneDisplayStyleResizePreview';

type LassoRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const noopToggleConnectors = () => {};

function prioritizeOverlapCycleItems(
  itemsByUnitId: Map<string, Array<{ id: string; startTime: number }>>,
  activeUnitId?: string,
): Map<string, Array<{ id: string; startTime: number }>> {
  if (!activeUnitId) return itemsByUnitId;

  const next = new Map<string, Array<{ id: string; startTime: number }>>();
  for (const [unitId, items] of itemsByUnitId.entries()) {
    const selectedIndex = items.findIndex((item) => item.id === activeUnitId);
    if (selectedIndex <= 0) {
      next.set(unitId, items);
      continue;
    }
    const reordered = [...items];
    const [selected] = reordered.splice(selectedIndex, 1);
    if (selected) reordered.unshift(selected);
    next.set(unitId, reordered);
  }

  return next;
}

function buildSegmentsByOverlapGroup(
  segments: LayerUnitDocType[],
  layout: SpeakerLayerLayoutResult,
): Map<string, LayerUnitDocType[]> {
  const next = new Map<string, LayerUnitDocType[]>();
  for (const segment of segments) {
    const groupId = layout.placements.get(segment.id)?.overlapGroupId;
    if (!groupId) continue;
    const bucket = next.get(groupId);
    if (bucket) {
      bucket.push(segment);
    } else {
      next.set(groupId, [segment]);
    }
  }
  return next;
}

type TranscriptionTimelineMediaLanesProps = {
  activeTextTimelineMode?: 'document' | 'media' | null;
  playerDuration: number;
  zoomPxPerSec: number;
  lassoRect: LassoRect | null;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  timelineUnitViewIndex: TimelineUnitViewIndexWithEpoch;
  timelineRenderUnits: LayerUnitDocType[];
  /**
   * 当前媒体上的单元全集，用于语段行按 parentUnitId 解析宿主单元（可宽于标尺视窗下的 timelineRenderUnits）。
   */
  segmentParentUnitLookup?: LayerUnitDocType[];
  flashLayerRowId: string;
  focusedLayerRowId: string;
  activeUnitId?: string;
  selectedTimelineUnit?: TimelineUnit | null;
  defaultTranscriptionLayerId: string | undefined;
  renderAnnotationItem: (
    utt: TimelineUnitView,
    layer: LayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>
      & {
        showSpeaker?: boolean;
        overlapCycleItems?: Array<{ id: string; startTime: number }>;
        overlapCycleStatus?: { index: number; total: number };
        content?: React.ReactNode;
        tools?: React.ReactNode;
        hasTrailingTools?: boolean;
        saveStatus?: 'dirty' | 'saving' | 'error';
        onRetrySave?: () => void;
      },
  ) => React.ReactNode;
  // TimelineLaneHeader props
  allLayersOrdered: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  onFocusLayer: (layerId: string) => void;
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
  speakerSortKeyById?: Record<string, number>;
  speakerLayerLayout?: SpeakerLayerLayoutResult;
  activeSpeakerFilterKey?: string;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  // Lane label resize
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** 独立边界层的 segment 数据 | Segment data for independent-boundary layers */
  segmentsByLayer?: Map<string, LayerUnitDocType[]>;
  /** 独立边界层的内容数据 | Content data for independent-boundary layers */
  segmentContentByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  /** 保存独立边界层 segment 内容 | Save segment content for independent-boundary layers */
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
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
  /** 层显示样式控制 | Layer display style control */
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof import('./LayerStyleSubmenu').buildLayerStyleMenuItems>[7];
  };
};

export const TranscriptionTimelineMediaLanes = memo(function TranscriptionTimelineMediaLanes({
  activeTextTimelineMode,
  playerDuration,
  zoomPxPerSec,
  lassoRect,
  transcriptionLayers,
  translationLayers,
  timelineUnitViewIndex: _timelineUnitViewIndex,
  timelineRenderUnits,
  segmentParentUnitLookup,
  flashLayerRowId,
  focusedLayerRowId,
  activeUnitId,
  selectedTimelineUnit,
  defaultTranscriptionLayerId,
  renderAnnotationItem,
  allLayersOrdered,
  onReorderLayers,
  deletableLayers,
  defaultLanguageId,
  defaultOrthographyId,
  onFocusLayer,
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
  speakerSortKeyById,
  speakerLayerLayout: incomingSpeakerLayerLayout,
  activeSpeakerFilterKey = 'all',
  speakerQuickActions,
  onLaneLabelWidthResize,
  segmentsByLayer,
  segmentContentByLayer,
  saveSegmentContentForLayer,
  translationAudioByLayer,
  mediaItems = [],
  recording = false,
  recordingUnitId = null,
  recordingLayerId = null,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
  transcribeVoiceTranslation,
  displayStyleControl,
}: Omit<TranscriptionTimelineMediaLanesProps, 'allLayersOrdered'> & {
  allLayersOrdered: LayerDocType[];
  deletableLayers: LayerDocType[];
  onFocusLayer: (layerId: string) => void;
  layerLinks?: LayerLinkDocType[];
}) {
  const locale = useLocale();
  const laneHeightResizeLabel = t(locale, 'transcription.timeline.resizeLaneHeight');
  const [layerAction, setLayerAction] = useState<{ action: LayerOperationActionType; layerId?: string } | null>(null);
  const { collapsedLayerIds, toggleLayerCollapsed: toggleLayerCollapsedState } = useCollapsedLayerIds();
  const [tempExpandedGroupByLayer, setTempExpandedGroupByLayer] = useState<Record<string, string>>({});
  const tempExpandTimersRef = useRef<Map<string, number>>(new Map());

  const { previewFontSizeByLayerId, handleResizePreview, handleResizeEnd } = useTimelineLaneDisplayStyleResizePreview(
    allLayersOrdered,
    displayStyleControl,
  );

  const { resizingLayerId, startLaneHeightResize } = useTimelineLaneHeightResize(
    onLaneHeightChange,
    handleResizeEnd,
    handleResizePreview,
  );
  const localSpeakerLayerLayout = useMemo(
    () => buildSpeakerLayerLayoutWithOptions(timelineRenderUnits, {
      trackMode: trackDisplayMode,
      ...(laneLockMap ? { laneLockMap } : {}),
      ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
    }),
    [laneLockMap, speakerSortKeyById, timelineRenderUnits, trackDisplayMode],
  );
  const speakerLayerLayout = incomingSpeakerLayerLayout ?? localSpeakerLayerLayout;
  const unitById = useMemo(() => {
    const next = new Map(timelineRenderUnits.map((item) => [item.id, item] as const));
    const extra = segmentParentUnitLookup ?? [];
    for (const u of extra) {
      if (!next.has(u.id)) next.set(u.id, u);
    }
    return next;
  }, [timelineRenderUnits, segmentParentUnitLookup]);
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
  const {
    segmentSpeakerLayoutByLayer,
    segmentSpeakerIdByLayer,
  } = useMemo(() => buildSegmentSpeakerLayoutMaps({
    transcriptionLayers,
    layerById,
    unitById,
    segmentsByLayer,
    defaultTranscriptionLayerId,
    activeSpeakerFilterKey,
    trackDisplayMode,
    laneLockMap,
    speakerSortKeyById,
  }), [
    activeSpeakerFilterKey,
    defaultTranscriptionLayerId,
    laneLockMap,
    layerById,
    segmentsByLayer,
    speakerSortKeyById,
    trackDisplayMode,
    transcriptionLayers,
    unitById,
  ]);

  const visibleSegmentsBySourceLayer = useMemo(() => {
    const next = new Map<string, LayerUnitDocType[]>();
    const normalizedSpeakerFilterKey = normalizeSpeakerFocusKey(activeSpeakerFilterKey);
    for (const layer of transcriptionLayers) {
      const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
      if (!sourceLayer || next.has(sourceLayer.id)) continue;
      const sourceSegments = segmentsByLayer?.get(sourceLayer.id) ?? [];
      if (activeSpeakerFilterKey === 'all') {
        next.set(sourceLayer.id, sourceSegments);
        continue;
      }
      next.set(sourceLayer.id, sourceSegments.filter((segment) => (
        resolveSpeakerFocusKeyFromSegment(segment, unitById) === normalizedSpeakerFilterKey
      )));
    }
    return next;
  }, [
    activeSpeakerFilterKey,
    defaultTranscriptionLayerId,
    layerById,
    segmentsByLayer,
    transcriptionLayers,
    unitById,
  ]);

  const segmentItemsByOverlapGroupByLayer = useMemo(() => {
    const next = new Map<string, Map<string, LayerUnitDocType[]>>();
    for (const [sourceLayerId, visibleSegments] of visibleSegmentsBySourceLayer.entries()) {
      const layout = segmentSpeakerLayoutByLayer.get(sourceLayerId);
      if (!layout) continue;
      next.set(sourceLayerId, buildSegmentsByOverlapGroup(visibleSegments, layout));
    }
    return next;
  }, [segmentSpeakerLayoutByLayer, visibleSegmentsBySourceLayer]);
  const unitsByOverlapGroupId = useMemo(() => {
    const next = new Map<string, LayerUnitDocType[]>();
    for (const utt of timelineRenderUnits) {
      const groupId = speakerLayerLayout.placements.get(utt.id)?.overlapGroupId;
      if (!groupId) continue;
      const bucket = next.get(groupId);
      if (bucket) {
        bucket.push(utt);
      } else {
        next.set(groupId, [utt]);
      }
    }
    return next;
  }, [speakerLayerLayout.placements, timelineRenderUnits]);
  const overlapCycleItemsByGroupId = useMemo(() => {
    const selectedOverlapUnitId = selectedTimelineUnit?.unitId ?? activeUnitId;
    const next = new Map<string, Map<string, Array<{ id: string; startTime: number }>>>();
    for (const [groupId, itemsByUnit] of speakerLayerLayout.overlapCycleItemsByGroupId.entries()) {
      next.set(groupId, prioritizeOverlapCycleItems(itemsByUnit, selectedOverlapUnitId));
    }
    return next;
  }, [activeUnitId, selectedTimelineUnit, speakerLayerLayout.overlapCycleItemsByGroupId]);

  const toggleLayerCollapsed = useCallback((layerId: string) => {
    toggleLayerCollapsedState(layerId);
    setTempExpandedGroupByLayer((prev) => {
      if (!(layerId in prev)) return prev;
      const { [layerId]: _, ...rest } = prev;
      return rest;
    });
    const timerId = tempExpandTimersRef.current.get(layerId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      tempExpandTimersRef.current.delete(layerId);
    }
  }, [toggleLayerCollapsedState]);

  useEffect(() => () => {
    for (const timerId of tempExpandTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    tempExpandTimersRef.current.clear();
  }, []);

  const activateTemporaryExpand = useCallback((layerId: string, overlapGroupId: string) => {
    setTempExpandedGroupByLayer((prev) => ({ ...prev, [layerId]: overlapGroupId }));
    const oldTimer = tempExpandTimersRef.current.get(layerId);
    if (oldTimer !== undefined) {
      window.clearTimeout(oldTimer);
    }
    const timerId = window.setTimeout(() => {
      setTempExpandedGroupByLayer((prev) => {
        if (!(layerId in prev)) return prev;
        const { [layerId]: _, ...rest } = prev;
        return rest;
      });
      tempExpandTimersRef.current.delete(layerId);
    }, 8000);
    tempExpandTimersRef.current.set(layerId, timerId);
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

  // Stable callback for layer actions - avoids creating new function per layer per render
  const handleLayerAction = useCallback((action: LayerOperationActionType, layerId?: string) => {
    if (action === 'delete' && layerId) {
      fireAndForget(requestDeleteLayer(layerId));
      return;
    }
    setLayerAction({ action, ...(layerId ? { layerId } : {}) });
  }, [requestDeleteLayer]);

  // Stable callback for lane pointer down - avoids creating new function per layer per render
  const handleLanePointerDown = useCallback((layerId: string, isCollapsed: boolean, e: React.PointerEvent<HTMLDivElement>) => {
    if (!isCollapsed) return;
    toggleLayerCollapsed(layerId);
    e.preventDefault();
    e.stopPropagation();
  }, [toggleLayerCollapsed]);

  return (
    <TimelineStyledContainer
      className="timeline-content"
      layoutStyle={{
        /* 时间轴像素宽 + 左侧 padding 同宽的 gutter，与 .timeline-content padding-left 一致，避免轨道内容区比标尺窄一列 | Timeline px + left gutter matches padding so lane area aligns with ruler */
        width: `calc(${playerDuration * zoomPxPerSec}px + var(--timeline-content-offset))`,
        minWidth: '100%',
      }}
    >
      {lassoRect && (
        <svg className="timeline-lasso-overlay" aria-hidden="true">
          <rect
            className="timeline-lasso-rect"
            x={lassoRect.x}
            y={lassoRect.y}
            width={lassoRect.w}
            height={lassoRect.h}
            rx={2}
            ry={2}
          />
        </svg>
      )}
      {allLayersOrdered.map((layer, idx) => {
        if (layer.layerType === 'transcription') {
        const segmentSourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
        const usesSegmentTimeline = Boolean(segmentSourceLayer);
        const segmentSourceLayerId = segmentSourceLayer?.id ?? '';
        const activeLayerLayout = usesSegmentTimeline
          ? (segmentSpeakerLayoutByLayer.get(segmentSourceLayerId) ?? EMPTY_SPEAKER_LAYOUT)
          : speakerLayerLayout;
        const isMultiTrackMode = trackDisplayMode !== 'single';
        const isCollapsed = collapsedLayerIds.has(layer.id);
        const activeOverlapGroupId = tempExpandedGroupByLayer[layer.id];
        const isTemporarilyExpanded = typeof activeOverlapGroupId === 'string';
        const effectiveCollapsed = isCollapsed && !(isMultiTrackMode && isTemporarilyExpanded);
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const expandedGroupMeta = activeOverlapGroupId
          ? activeLayerLayout.overlapGroups.find((group) => group.id === activeOverlapGroupId)
          : undefined;
        const activeSubTrackCount = isMultiTrackMode
          ? (expandedGroupMeta?.subTrackCount ?? activeLayerLayout.subTrackCount)
          : 1;
        const visibleLaneHeight = effectiveCollapsed ? 14 : baseLaneHeight * activeSubTrackCount;
        const previewFontSize = previewFontSizeByLayerId[layer.id];
        const layerForDisplay = previewFontSize == null
          ? layer
          : {
              ...layer,
              displaySettings: {
                ...layer.displaySettings,
                fontSize: previewFontSize,
              },
            };
        const collapsedOverlapMarkers = isMultiTrackMode
          ? activeLayerLayout.overlapGroups.filter((group) => group.speakerCount > 1)
          : [];
        const rawVisibleSegments: LayerUnitDocType[] = usesSegmentTimeline
          ? (isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
              ? (segmentItemsByOverlapGroupByLayer.get(segmentSourceLayerId)?.get(activeOverlapGroupId) ?? [])
              : (visibleSegmentsBySourceLayer.get(segmentSourceLayerId) ?? []))
          : [];
        const rawVisibleUnits: LayerUnitDocType[] = usesSegmentTimeline
          ? []
          : (isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
              ? (unitsByOverlapGroupId.get(activeOverlapGroupId) ?? [])
              : timelineRenderUnits);
        const visibleUnits: TimelineUnitView[] = usesSegmentTimeline
          ? rawVisibleSegments.map((s) => scopeTimelineUnitViewToLayer(segmentToView(s, () => ''), layer.id))
          : rawVisibleUnits.map((u) => unitToView(u, layer.id));
        const overlapCycleItemsByUnitId = isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
          ? ((usesSegmentTimeline
              ? activeLayerLayout.overlapCycleItemsByGroupId.get(activeOverlapGroupId)
              : overlapCycleItemsByGroupId.get(activeOverlapGroupId))
            ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UNIT_ID)
          : ((usesSegmentTimeline
              ? activeLayerLayout.overlapCycleItemsByGroupId.get('__all__')
              : overlapCycleItemsByGroupId.get('__all__'))
            ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UNIT_ID);
        return (
          <TranscriptionTimelineMediaTranscriptionLane
            key={`tl-${layer.id}`}
            layer={layer}
            layerIndex={idx}
            zoomPxPerSec={zoomPxPerSec}
            flashLayerRowId={flashLayerRowId}
            focusedLayerRowId={focusedLayerRowId}
            {...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {})}
            {...(activeUnitId !== undefined ? { activeUnitId } : {})}
            allLayersOrdered={allLayersOrdered}
            onReorderLayers={onReorderLayers}
            deletableLayers={deletableLayers}
            onFocusLayer={onFocusLayer}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? noopToggleConnectors}
            trackDisplayMode={trackDisplayMode}
            {...(onToggleTrackDisplayMode ? { onToggleTrackDisplayMode } : {})}
            {...(onSetTrackDisplayMode ? { onSetTrackDisplayMode } : {})}
            {...(onLockSelectedSpeakersToLane ? { onLockSelectedSpeakersToLane } : {})}
            {...(onUnlockSelectedSpeakers ? { onUnlockSelectedSpeakers } : {})}
            {...(onResetTrackAutoLayout ? { onResetTrackAutoLayout } : {})}
            {...(selectedSpeakerNamesForLock ? { selectedSpeakerNamesForLock } : {})}
            {...(laneLockMap ? { laneLockMap } : {})}
            {...(speakerQuickActions ? { speakerQuickActions } : {})}
            {...(onLaneLabelWidthResize ? { onLaneLabelWidthResize } : {})}
            {...(displayStyleControl ? { displayStyleControl } : {})}
            isCollapsed={isCollapsed}
            effectiveCollapsed={effectiveCollapsed}
            baseLaneHeight={baseLaneHeight}
            visibleLaneHeight={visibleLaneHeight}
            activeSubTrackCount={activeSubTrackCount}
            isMultiTrackMode={isMultiTrackMode}
            resizingLayerId={resizingLayerId}
            {...(previewFontSize != null ? { previewFontSize } : {})}
            layerForDisplay={layerForDisplay}
            activeLayerLayout={activeLayerLayout}
            collapsedOverlapMarkers={collapsedOverlapMarkers}
            visibleUnits={visibleUnits}
            overlapCycleItemsByUnitId={overlapCycleItemsByUnitId}
            segmentSourceLayerId={segmentSourceLayerId}
            segmentSpeakerIdByLayer={segmentSpeakerIdByLayer}
            {...(segmentContentByLayer ? { segmentContentByLayer } : {})}
            unitById={unitById}
            segmentById={segmentById}
            {...(activeOverlapGroupId ? { activeOverlapGroupId } : {})}
            unitDrafts={unitDrafts}
            getUnitTextForLayer={getUnitTextForLayer}
            {...(saveSegmentContentForLayer ? { saveSegmentContentForLayer } : {})}
            scheduleAutoSave={scheduleAutoSave}
            clearAutoSaveTimer={clearAutoSaveTimer}
            saveUnitLayerText={saveUnitLayerText}
            focusedTranslationDraftKeyRef={focusedTranslationDraftKeyRef}
            {...(translationAudioByLayer !== undefined ? { translationAudioByLayer } : {})}
            mediaItemById={mediaItemById}
            recording={recording}
            recordingUnitId={recordingUnitId}
            recordingLayerId={recordingLayerId}
            {...(startRecordingForUnit ? { startRecordingForUnit } : {})}
            {...(stopRecording ? { stopRecording } : {})}
            {...(deleteVoiceTranslation ? { deleteVoiceTranslation } : {})}
            setUnitDrafts={setUnitDrafts}
            renderAnnotationItem={renderAnnotationItem}
            renderLaneLabel={renderLaneLabel}
            startLaneHeightResize={startLaneHeightResize}
            handleLayerAction={handleLayerAction}
            onToggleCollapsed={toggleLayerCollapsed}
            onActivateTemporaryExpand={activateTemporaryExpand}
            onLanePointerDown={handleLanePointerDown}
          />
      );
        }

        const isCollapsed = collapsedLayerIds.has(layer.id);
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const visibleLaneHeight = isCollapsed ? 14 : baseLaneHeight;
        // 独立边界层使用按 layer 聚合的 canonical segment graph，否则继承 unit 边界
        // Independent-boundary layers use the canonical per-layer segment graph; other layers inherit unit boundaries.
        const usesOwnSegments = layerUsesOwnSegments(layer, defaultTranscriptionLayerId);
        const previewFontSize = previewFontSizeByLayerId[layer.id];
        const layerForDisplay = previewFontSize == null
          ? layer
          : {
              ...layer,
              displaySettings: {
                ...layer.displaySettings,
                fontSize: previewFontSize,
              },
            };
        const iterationSource = listSegmentTimelineUnitsForLayer(
          layer,
          layerById,
          segmentsByLayer,
          timelineRenderUnits,
          defaultTranscriptionLayerId,
          layerLinks,
        );
        const iterationUnits: TimelineUnitView[] = iterationSource.map((item) => (
          item.unitType === 'segment'
            ? scopeTimelineUnitViewToLayer(segmentToView(item, () => ''), layer.id)
            : unitToView(item, layer.id)
        ));
        return (
        <TimelineStyledContainer
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''}`}
          layoutStyle={{
            '--timeline-lane-height': `${visibleLaneHeight}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => handleLanePointerDown(layer.id, isCollapsed, e)}
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
            onLayerAction={handleLayerAction}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? noopToggleConnectors}
            headerMenuPreset="layer-chrome"
            isCollapsed={isCollapsed}
            onToggleCollapsed={toggleLayerCollapsed}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
            {...(displayStyleControl && { displayStyleControl })}
          />
          {!isCollapsed && iterationUnits.map((item) => {
            const text = usesOwnSegments
              ? (segmentContentByLayer?.get(layer.id)?.get(item.id)?.text ?? '')
              : (translationTextByLayer.get(layer.id)?.get(item.id)?.text ?? '');
            const audioScopeId = recordingScopeUnitId(item);
            const translationAudioEntries = translationAudioByLayer?.get(layer.id);
            const audioTranslation = translationAudioEntries?.get(audioScopeId)
              ?? (audioScopeId !== item.id ? translationAudioEntries?.get(item.id) : undefined);
            const audioMedia = audioTranslation?.translationAudioMediaId
              ? mediaItemById.get(audioTranslation.translationAudioMediaId)
              : undefined;
            const draftKey = `${layer.id}-${item.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            return (
              <TranscriptionTimelineMediaTranslationRow
                key={`tr-sub-${layer.id}-${item.id}`}
                item={item}
                layer={layer}
                layerForDisplay={layerForDisplay}
                baseLaneHeight={baseLaneHeight}
                usesOwnSegments={usesOwnSegments}
                unitById={unitById}
                segmentById={segmentById}
                text={text}
                draft={draft}
                draftKey={draftKey}
                audioMedia={audioMedia}
                recording={recording}
                recordingUnitId={recordingUnitId}
                recordingLayerId={recordingLayerId}
                startRecordingForUnit={startRecordingForUnit}
                stopRecording={stopRecording}
                deleteVoiceTranslation={deleteVoiceTranslation}
                {...(transcribeVoiceTranslation ? { transcribeVoiceTranslation } : {})}
                saveSegmentContentForLayer={saveSegmentContentForLayer}
                saveUnitLayerText={saveUnitLayerText}
                scheduleAutoSave={scheduleAutoSave}
                clearAutoSaveTimer={clearAutoSaveTimer}
                setTranslationDrafts={setTranslationDrafts}
                focusedTranslationDraftKeyRef={focusedTranslationDraftKeyRef}
                renderAnnotationItem={renderAnnotationItem}
              />
            );
          })}
          {!isCollapsed && (
            <div
              className="timeline-lane-resize-handle timeline-lane-resize-handle-bottom timeline-lane-layer-splitter"
              onPointerDown={(event) => startLaneHeightResize(event, layer.id, baseLaneHeight, 'bottom')}
              role="separator"
              aria-orientation="horizontal"
              aria-label={laneHeightResizeLabel}
            />
          )}
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
    </TimelineStyledContainer>
  );
});

TranscriptionTimelineMediaLanes.displayName = 'TranscriptionTimelineMediaLanes';
