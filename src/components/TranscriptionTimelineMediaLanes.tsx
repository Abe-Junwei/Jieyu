import type {
  LayerLinkDocType,
  LayerDocType,
  LayerDisplaySettings,
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  MediaItemDocType,
  OrthographyDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
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
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import {
  BASE_FONT_SIZE,
  computeFontSizeFromRenderPolicy,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import {
  buildSpeakerLayerLayoutWithOptions,
  type SpeakerLayerLayoutResult,
} from '../utils/speakerLayerLayout';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { utteranceToView, segmentToView, type TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import { TranscriptionTimelineMediaTranslationRow } from './TranscriptionTimelineMediaTranslationRow';
import { TranscriptionTimelineMediaTranscriptionLane } from './TranscriptionTimelineMediaTranscriptionLane';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import {
  buildSegmentSpeakerLayoutMaps,
  EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID,
  EMPTY_SPEAKER_LAYOUT,
  normalizeSpeakerFocusKey,
  resolveSpeakerFocusKeyFromSegment,
} from './transcriptionTimelineSegmentSpeakerLayout';

type LassoRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function prioritizeOverlapCycleItems(
  itemsByUtteranceId: Map<string, Array<{ id: string; startTime: number }>>,
  activeUnitId?: string,
): Map<string, Array<{ id: string; startTime: number }>> {
  if (!activeUnitId) return itemsByUtteranceId;

  const next = new Map<string, Array<{ id: string; startTime: number }>>();
  for (const [utteranceId, items] of itemsByUtteranceId.entries()) {
    const selectedIndex = items.findIndex((item) => item.id === activeUnitId);
    if (selectedIndex <= 0) {
      next.set(utteranceId, items);
      continue;
    }
    const reordered = [...items];
    const [selected] = reordered.splice(selectedIndex, 1);
    if (selected) reordered.unshift(selected);
    next.set(utteranceId, reordered);
  }

  return next;
}

function buildSegmentsByOverlapGroup(
  segments: LayerSegmentDocType[],
  layout: SpeakerLayerLayoutResult,
): Map<string, LayerSegmentDocType[]> {
  const next = new Map<string, LayerSegmentDocType[]>();
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

function getSegmentTimelineIterationSource(
  layer: LayerDocType,
  layerById: ReadonlyMap<string, LayerDocType>,
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]> | undefined,
  timelineRenderUtterances: UtteranceDocType[],
  defaultTranscriptionLayerId?: string,
): ReadonlyArray<UtteranceDocType | LayerSegmentDocType> {
  const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
  if (!sourceLayer) {
    return timelineRenderUtterances;
  }

  return segmentsByLayer?.get(sourceLayer.id) ?? [];
}

type TranscriptionTimelineMediaLanesProps = {
  playerDuration: number;
  zoomPxPerSec: number;
  lassoRect: LassoRect | null;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  timelineUnitViewIndex: TimelineUnitViewIndexWithEpoch;
  timelineRenderUtterances: UtteranceDocType[];
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
  segmentsByLayer?: Map<string, LayerSegmentDocType[]>;
  /** 独立边界层的内容数据 | Content data for independent-boundary layers */
  segmentContentByLayer?: Map<string, Map<string, LayerSegmentContentDocType>>;
  /** 保存独立边界层 segment 内容 | Save segment content for independent-boundary layers */
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  translationAudioByLayer?: Map<string, Map<string, UtteranceTextDocType>>;
  mediaItems?: MediaItemDocType[];
  recording?: boolean;
  recordingUtteranceId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUtterance?: (utterance: UtteranceDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (utterance: UtteranceDocType, layer: LayerDocType) => Promise<void>;
  /** 层显示样式控制 | Layer display style control */
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof import('./LayerStyleSubmenu').buildLayerStyleMenuItems>[7];
  };
};

type LayerActionType =
  | 'create-transcription'
  | 'create-translation'
  | 'edit-transcription-metadata'
  | 'edit-translation-metadata'
  | 'delete';

export const TranscriptionTimelineMediaLanes = memo(function TranscriptionTimelineMediaLanes({
  playerDuration,
  zoomPxPerSec,
  lassoRect,
  transcriptionLayers,
  translationLayers,
  timelineUnitViewIndex: _timelineUnitViewIndex,
  timelineRenderUtterances,
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
  recordingUtteranceId = null,
  recordingLayerId = null,
  startRecordingForUtterance,
  stopRecording,
  deleteVoiceTranslation,
  displayStyleControl,
}: Omit<TranscriptionTimelineMediaLanesProps, 'allLayersOrdered'> & {
  allLayersOrdered: LayerDocType[];
  deletableLayers: LayerDocType[];
  onFocusLayer: (layerId: string) => void;
  layerLinks?: LayerLinkDocType[];
}) {
  const [layerAction, setLayerAction] = useState<{ action: LayerActionType; layerId?: string } | null>(null);
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(new Set());
  const [previewFontSizeByLayerId, setPreviewFontSizeByLayerId] = useState<Record<string, number>>({});
  const [tempExpandedGroupByLayer, setTempExpandedGroupByLayer] = useState<Record<string, string>>({});
  const tempExpandTimersRef = useRef<Map<string, number>>(new Map());

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
  const localSpeakerLayerLayout = useMemo(
    () => buildSpeakerLayerLayoutWithOptions(timelineRenderUtterances, {
      trackMode: trackDisplayMode,
      ...(laneLockMap ? { laneLockMap } : {}),
      ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
    }),
    [laneLockMap, speakerSortKeyById, timelineRenderUtterances, trackDisplayMode],
  );
  const speakerLayerLayout = incomingSpeakerLayerLayout ?? localSpeakerLayerLayout;
  const utteranceById = useMemo(
    () => new Map(timelineRenderUtterances.map((item) => [item.id, item] as const)),
    [timelineRenderUtterances],
  );
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
    utteranceById,
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
    utteranceById,
  ]);
  const segmentItemsByOverlapGroupByLayer = useMemo(() => {
    const next = new Map<string, Map<string, LayerSegmentDocType[]>>();
    for (const layer of transcriptionLayers) {
      const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
      if (!sourceLayer) continue;
      const layout = segmentSpeakerLayoutByLayer.get(sourceLayer.id);
      if (!layout) continue;
      const segments = (segmentsByLayer?.get(sourceLayer.id) ?? []).filter((segment) => (
        activeSpeakerFilterKey === 'all'
          || resolveSpeakerFocusKeyFromSegment(segment, utteranceById) === normalizeSpeakerFocusKey(activeSpeakerFilterKey)
      ));
      next.set(sourceLayer.id, buildSegmentsByOverlapGroup(segments, layout));
    }
    return next;
  }, [activeSpeakerFilterKey, defaultTranscriptionLayerId, layerById, segmentSpeakerLayoutByLayer, segmentsByLayer, transcriptionLayers, utteranceById]);
  const utterancesByOverlapGroupId = useMemo(() => {
    const next = new Map<string, UtteranceDocType[]>();
    for (const utt of timelineRenderUtterances) {
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
  }, [speakerLayerLayout.placements, timelineRenderUtterances]);
  const overlapCycleItemsByGroupId = useMemo(() => {
    const selectedOverlapUtteranceId = selectedTimelineUnit?.unitId ?? activeUnitId;
    const next = new Map<string, Map<string, Array<{ id: string; startTime: number }>>>();
    for (const [groupId, itemsByUtterance] of speakerLayerLayout.overlapCycleItemsByGroupId.entries()) {
      next.set(groupId, prioritizeOverlapCycleItems(itemsByUtterance, selectedOverlapUtteranceId));
    }
    return next;
  }, [activeUnitId, selectedTimelineUnit, speakerLayerLayout.overlapCycleItemsByGroupId]);

  const toggleLayerCollapsed = useCallback((layerId: string) => {
    setCollapsedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
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
  }, []);

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
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    renderLaneLabel,
    getUtteranceTextForLayer,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUtteranceText,
    saveTextTranslationForUtterance,
    createLayer,
    updateLayerMetadata,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  } = useTranscriptionEditorContext();

  const {
    deleteLayerConfirm,
    deleteConfirmKeepUtterances,
    setDeleteConfirmKeepUtterances,
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
  const handleLayerAction = useCallback((action: LayerActionType, layerId?: string) => {
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
        const rawVisibleSegments: LayerSegmentDocType[] = usesSegmentTimeline
          ? (isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
              ? (segmentItemsByOverlapGroupByLayer.get(segmentSourceLayerId)?.get(activeOverlapGroupId) ?? [])
              : ((segmentsByLayer?.get(segmentSourceLayerId) ?? []).filter((segment) => (
                  activeSpeakerFilterKey === 'all'
                    || resolveSpeakerFocusKeyFromSegment(segment, utteranceById) === normalizeSpeakerFocusKey(activeSpeakerFilterKey)
                ))))
          : [];
        const rawVisibleUtterances: UtteranceDocType[] = usesSegmentTimeline
          ? []
          : (isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
              ? (utterancesByOverlapGroupId.get(activeOverlapGroupId) ?? [])
              : timelineRenderUtterances);
        const defaultLayerId = defaultTranscriptionLayerId ?? '';
        const visibleUnits: TimelineUnitView[] = usesSegmentTimeline
          ? rawVisibleSegments.map((s) => segmentToView(s, () => ''))
          : rawVisibleUtterances.map((u) => utteranceToView(u, defaultLayerId));
        const overlapCycleItemsByUtteranceId = isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
          ? ((usesSegmentTimeline
              ? activeLayerLayout.overlapCycleItemsByGroupId.get(activeOverlapGroupId)
              : overlapCycleItemsByGroupId.get(activeOverlapGroupId))
            ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID)
          : ((usesSegmentTimeline
              ? activeLayerLayout.overlapCycleItemsByGroupId.get('__all__')
              : overlapCycleItemsByGroupId.get('__all__'))
            ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID);
        return (
          <TranscriptionTimelineMediaTranscriptionLane
            key={`tl-${layer.id}`}
            layer={layer}
            layerIndex={idx}
            zoomPxPerSec={zoomPxPerSec}
            flashLayerRowId={flashLayerRowId}
            focusedLayerRowId={focusedLayerRowId}
            allLayersOrdered={allLayersOrdered}
            onReorderLayers={onReorderLayers}
            deletableLayers={deletableLayers}
            onFocusLayer={onFocusLayer}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? (() => {})}
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
            overlapCycleItemsByUtteranceId={overlapCycleItemsByUtteranceId}
            segmentSourceLayerId={segmentSourceLayerId}
            segmentSpeakerIdByLayer={segmentSpeakerIdByLayer}
            {...(segmentContentByLayer ? { segmentContentByLayer } : {})}
            utteranceById={utteranceById}
            {...(activeOverlapGroupId ? { activeOverlapGroupId } : {})}
            utteranceDrafts={utteranceDrafts}
            getUtteranceTextForLayer={getUtteranceTextForLayer}
            {...(saveSegmentContentForLayer ? { saveSegmentContentForLayer } : {})}
            scheduleAutoSave={scheduleAutoSave}
            clearAutoSaveTimer={clearAutoSaveTimer}
            saveUtteranceText={saveUtteranceText}
            setUtteranceDrafts={setUtteranceDrafts}
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
        // 独立边界层使用按 layer 聚合的 canonical segment graph，否则继承 utterance 边界
        // Independent-boundary layers use the canonical per-layer segment graph; other layers inherit utterance boundaries.
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
        const iterationSource = getSegmentTimelineIterationSource(
          layer,
          layerById,
          segmentsByLayer,
          timelineRenderUtterances,
          defaultTranscriptionLayerId,
        );
        const iterationUnits: TimelineUnitView[] = usesOwnSegments
          ? iterationSource.map((item) => segmentToView(item as LayerSegmentDocType, () => ''))
          : iterationSource.map((item) => utteranceToView(item as UtteranceDocType, layer.id));
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
            allLayers={allLayersOrdered}
            onReorderLayers={onReorderLayers}
            deletableLayers={deletableLayers}
            onFocusLayer={onFocusLayer}
            renderLaneLabel={renderLaneLabel}
            onLayerAction={handleLayerAction}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? (() => {})}
            isCollapsed={isCollapsed}
            onToggleCollapsed={toggleLayerCollapsed}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
            {...(displayStyleControl && { displayStyleControl })}
          />
          {!isCollapsed && iterationUnits.map((item) => {
            const text = usesOwnSegments
              ? (segmentContentByLayer?.get(layer.id)?.get(item.id)?.text ?? '')
              : (translationTextByLayer.get(layer.id)?.get(item.id)?.text ?? '');
            const audioTranslation = translationAudioByLayer?.get(layer.id)?.get(item.id);
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
                utteranceById={utteranceById}
                text={text}
                draft={draft}
                draftKey={draftKey}
                audioMedia={audioMedia}
                recording={recording}
                recordingUtteranceId={recordingUtteranceId}
                recordingLayerId={recordingLayerId}
                startRecordingForUtterance={startRecordingForUtterance}
                stopRecording={stopRecording}
                deleteVoiceTranslation={deleteVoiceTranslation}
                saveSegmentContentForLayer={saveSegmentContentForLayer}
                saveTextTranslationForUtterance={saveTextTranslationForUtterance}
                scheduleAutoSave={scheduleAutoSave}
                clearAutoSaveTimer={clearAutoSaveTimer}
                setTranslationDrafts={setTranslationDrafts}
                focusedTranslationDraftKeyRef={focusedTranslationDraftKeyRef}
                renderAnnotationItem={renderAnnotationItem}
              />
            );
          })}
          {!isCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, baseLaneHeight)}
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
        keepUtterances={deleteConfirmKeepUtterances}
        onKeepUtterancesChange={setDeleteConfirmKeepUtterances}
        onCancel={cancelDeleteLayerConfirm}
        onConfirm={() => { fireAndForget(confirmDeleteLayer()); }}
      />
    </TimelineStyledContainer>
  );
});

TranscriptionTimelineMediaLanes.displayName = 'TranscriptionTimelineMediaLanes';
