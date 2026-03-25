import type { LayerLinkDocType, LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import type { SpeakerFocusMode, TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { TimelineLaneHeader } from './TimelineLaneHeader';
import { LayerActionPopover } from './LayerActionPopover';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { isIndependentBoundaryLayer } from '../hooks/useLayerSegments';
import { DEFAULT_TIMELINE_LANE_HEIGHT, useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import {
  buildSpeakerLayerLayoutWithOptions,
  type SpeakerLayerLayoutResult,
} from '../utils/speakerLayerLayout';

type LassoRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID = new Map<string, Array<{ id: string; startTime: number }>>();

function normalizeSpeakerFocusKey(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'unknown-speaker';
}


function prioritizeOverlapCycleItems(
  itemsByUtteranceId: Map<string, Array<{ id: string; startTime: number }>>,
  selectedUtteranceId?: string,
): Map<string, Array<{ id: string; startTime: number }>> {
  if (!selectedUtteranceId) return itemsByUtteranceId;

  const next = new Map<string, Array<{ id: string; startTime: number }>>();
  for (const [utteranceId, items] of itemsByUtteranceId.entries()) {
    const selectedIndex = items.findIndex((item) => item.id === selectedUtteranceId);
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

type TranscriptionTimelineMediaLanesProps = {
  playerDuration: number;
  zoomPxPerSec: number;
  lassoRect: LassoRect | null;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  timelineRenderUtterances: UtteranceDocType[];
  flashLayerRowId: string;
  focusedLayerRowId: string;
  selectedUtteranceId?: string;
  defaultTranscriptionLayerId: string | undefined;
  renderAnnotationItem: (
    utt: UtteranceDocType,
    layer: LayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>
      & {
        showSpeaker?: boolean;
        overlapCycleItems?: Array<{ id: string; startTime: number }>;
        overlapCycleStatus?: { index: number; total: number };
      },
  ) => React.ReactNode;
  // TimelineLaneHeader props
  allLayersOrdered: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
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
  speakerFocusMode?: SpeakerFocusMode;
  speakerFocusSpeakerKey?: string;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onCreateAndAssignToSelection: (name: string) => void;
  };
  // Lane label resize
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** 独立边界层的 segment 数据 | Segment data for independent-boundary layers */
  segmentsByLayer?: Map<string, LayerSegmentDocType[]>;
};

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

export function TranscriptionTimelineMediaLanes({
  playerDuration,
  zoomPxPerSec,
  lassoRect,
  transcriptionLayers,
  translationLayers,
  timelineRenderUtterances,
  flashLayerRowId,
  focusedLayerRowId,
  selectedUtteranceId,
  defaultTranscriptionLayerId,
  renderAnnotationItem,
  allLayersOrdered,
  onReorderLayers,
  deletableLayers,
  onFocusLayer,
  layerLinks = [],
  showConnectors = false,
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
  speakerFocusMode = 'all',
  speakerFocusSpeakerKey,
  speakerQuickActions,
  onLaneLabelWidthResize,
  segmentsByLayer,
}: Omit<TranscriptionTimelineMediaLanesProps, 'allLayersOrdered'> & {
  allLayersOrdered: LayerDocType[];
  deletableLayers: LayerDocType[];
  onFocusLayer: (layerId: string) => void;
  layerLinks?: LayerLinkDocType[];
}) {
  const [layerAction, setLayerAction] = useState<{ action: LayerActionType; layerId?: string } | null>(null);
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(new Set());
  const [tempExpandedGroupByLayer, setTempExpandedGroupByLayer] = useState<Record<string, string>>({});
  const tempExpandTimersRef = useRef<Map<string, number>>(new Map());
  const { resizingLayerId, startLaneHeightResize } = useTimelineLaneHeightResize(onLaneHeightChange);
  const localSpeakerLayerLayout = useMemo(
    () => buildSpeakerLayerLayoutWithOptions(timelineRenderUtterances, {
      ...(laneLockMap ? { laneLockMap } : {}),
      ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
    }),
    [laneLockMap, speakerSortKeyById, timelineRenderUtterances],
  );
  const speakerLayerLayout = incomingSpeakerLayerLayout ?? localSpeakerLayerLayout;
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
    const next = new Map<string, Map<string, Array<{ id: string; startTime: number }>>>();
    for (const [groupId, itemsByUtterance] of speakerLayerLayout.overlapCycleItemsByGroupId.entries()) {
      next.set(groupId, prioritizeOverlapCycleItems(itemsByUtterance, selectedUtteranceId));
    }
    return next;
  }, [selectedUtteranceId, speakerLayerLayout.overlapCycleItemsByGroupId]);

  const toggleLayerCollapsed = (layerId: string) => {
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
  };

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
  }, []);

  return (
    <div className="timeline-content" style={{ width: playerDuration * zoomPxPerSec }}>
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
      {transcriptionLayers.map((layer, idx) => {
        const isMultiTrackMode = trackDisplayMode !== 'single';
        const isCollapsed = collapsedLayerIds.has(layer.id);
        const activeOverlapGroupId = tempExpandedGroupByLayer[layer.id];
        const isTemporarilyExpanded = typeof activeOverlapGroupId === 'string';
        const effectiveCollapsed = isCollapsed && !(isMultiTrackMode && isTemporarilyExpanded);
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const expandedGroupMeta = activeOverlapGroupId
          ? speakerLayerLayout.overlapGroups.find((group) => group.id === activeOverlapGroupId)
          : undefined;
        const activeSubTrackCount = isMultiTrackMode
          ? (expandedGroupMeta?.subTrackCount ?? speakerLayerLayout.subTrackCount)
          : 1;
        const visibleLaneHeight = effectiveCollapsed ? 14 : baseLaneHeight * activeSubTrackCount;
        const collapsedOverlapMarkers = isMultiTrackMode
          ? speakerLayerLayout.overlapGroups.filter((group) => group.speakerCount > 1)
          : [];
        const visibleUtterances = isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
          ? (utterancesByOverlapGroupId.get(activeOverlapGroupId) ?? [])
          : timelineRenderUtterances;
        const overlapCycleItemsByUtteranceId = isMultiTrackMode && !effectiveCollapsed && activeOverlapGroupId
          ? (overlapCycleItemsByGroupId.get(activeOverlapGroupId) ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID)
          : (overlapCycleItemsByGroupId.get('__all__') ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID);
        return (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${effectiveCollapsed ? 'timeline-lane-collapsed' : ''} ${isMultiTrackMode && !effectiveCollapsed && speakerLayerLayout.subTrackCount > 1 ? 'timeline-lane-speaker-layered' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${visibleLaneHeight}px`,
            '--timeline-subtrack-height': `${baseLaneHeight}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => handleLanePointerDown(layer.id, effectiveCollapsed, e)}
          onClick={(e) => {
            if (!onToggleTrackDisplayMode) return;
            if (e.target !== e.currentTarget) return;
            onToggleTrackDisplayMode();
          }}
        >
          <TimelineLaneHeader
            layer={layer}
            layerIndex={idx}
            allLayers={allLayersOrdered}
            transcriptionLayersCount={transcriptionLayers.length}
            onReorderLayers={onReorderLayers}
            deletableLayers={deletableLayers}
            onFocusLayer={onFocusLayer}
            renderLaneLabel={renderLaneLabel}
            onLayerAction={handleLayerAction}
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
                ...(speakerLayerLayout.lockConflictCount > 0 ? { lockConflictCount: speakerLayerLayout.lockConflictCount } : {}),
              },
            })}
            isCollapsed={effectiveCollapsed}
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
          />
          {isMultiTrackMode && isCollapsed && collapsedOverlapMarkers.map((group) => (
            <button
              key={`ov-hint-${layer.id}-${group.id}`}
              type="button"
              className="timeline-lane-overlap-hint"
              title="临时展开该重叠时间窗"
              style={{ left: group.centerTime * zoomPxPerSec }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                activateTemporaryExpand(layer.id, group.id);
              }}
            >
              {group.speakerCount}人
            </button>
          ))}
          {!effectiveCollapsed && visibleUtterances.map((utt) => {
            const utteranceSpeakerKey = normalizeSpeakerFocusKey(utt.speakerId);
            const focusMatched = speakerFocusMode === 'all' || !speakerFocusSpeakerKey || utteranceSpeakerKey === speakerFocusSpeakerKey;
            const shouldHideForFocus = speakerFocusMode === 'focus-hard' && !focusMatched;
            const shouldDimForFocus = speakerFocusMode === 'focus-soft' && !focusMatched;
            const sourceText = getUtteranceTextForLayer(utt, layer.id);
            const draftKey = `trc-${layer.id}-${utt.id}`;
            const legacyDraft = layer.id === defaultTranscriptionLayerId ? utteranceDrafts[utt.id] : undefined;
            const draft = utteranceDrafts[draftKey] ?? legacyDraft ?? sourceText;
            const placement = speakerLayerLayout.placements.get(utt.id);
            const subTrackIndex = isMultiTrackMode ? (placement?.subTrackIndex ?? 0) : 0;
            const overlapCycleItems = overlapCycleItemsByUtteranceId.get(utt.id);
            const overlapCycleExtra = overlapCycleItems ? { overlapCycleItems } : {};
            const overlapCycleStatus = overlapCycleItems && overlapCycleItems.length > 1
              ? {
                index: Math.max(1, overlapCycleItems.findIndex((item) => item.id === utt.id) + 1),
                total: overlapCycleItems.length,
              }
              : undefined;
            return (
              <div
                key={`trc-sub-${layer.id}-${utt.id}`}
                className={`timeline-annotation-subtrack${shouldHideForFocus ? ' timeline-annotation-subtrack-focus-hidden' : ''}${shouldDimForFocus ? ' timeline-annotation-subtrack-focus-dim' : ''}`}
                style={{
                  top: subTrackIndex * baseLaneHeight,
                  height: baseLaneHeight,
                }}
              >
                {renderAnnotationItem(utt, layer, draft, {
                  ...overlapCycleExtra,
                  ...(overlapCycleStatus ? { overlapCycleStatus } : {}),
                  onChange: (e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: value }));
                    if (value !== sourceText) {
                      scheduleAutoSave(`utt-${layer.id}-${utt.id}`, async () => {
                        await saveUtteranceText(utt.id, value, layer.id);
                      });
                    }
                  },
                  onBlur: (e) => {
                    const value = normalizeSingleLine(e.target.value);
                    clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
                    if (value !== sourceText) {
                      fireAndForget(saveUtteranceText(utt.id, value, layer.id));
                    }
                  },
                })}
              </div>
            );
          })}
          {!effectiveCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, baseLaneHeight)}
            role="separator"
            aria-orientation="horizontal"
          />}
        </div>
      );})}
      {translationLayers.map((layer, idx) => {
        const isCollapsed = collapsedLayerIds.has(layer.id);
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const visibleLaneHeight = isCollapsed ? 14 : baseLaneHeight;
        // 独立边界层使用 layer_segments 数据源，否则继承 utterance 边界
        // Independent-boundary layers use layer_segments, others inherit utterance boundaries
        const isIndependent = isIndependentBoundaryLayer(layer);
        const layerSegments = isIndependent ? (segmentsByLayer?.get(layer.id) ?? []) : undefined;
        const iterationSource: Array<{ id: string; startTime: number; endTime: number }> =
          layerSegments ?? timelineRenderUtterances;
        return (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${visibleLaneHeight}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => handleLanePointerDown(layer.id, isCollapsed, e)}
        >
          <TimelineLaneHeader
            layer={layer}
            layerIndex={transcriptionLayers.length + idx}
            allLayers={allLayersOrdered}
            transcriptionLayersCount={transcriptionLayers.length}
            onReorderLayers={onReorderLayers}
            deletableLayers={deletableLayers}
            onFocusLayer={onFocusLayer}
            renderLaneLabel={renderLaneLabel}
            onLayerAction={handleLayerAction}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? (() => {})}
            isCollapsed={isCollapsed}
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
          />
          {!isCollapsed && iterationSource.map((item) => {
            const text = isIndependent
              ? '' // 独立边界层的文本从 segment_contents 加载（后续扩展） | Text from segment_contents (future extension)
              : (translationTextByLayer.get(layer.id)?.get(item.id)?.text ?? '');
            const draftKey = `${layer.id}-${item.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            // 适配 renderAnnotationItem 所需的 TimelineUtterance 形状
            // Adapt to TimelineUtterance shape required by renderAnnotationItem
            const uttCompat = item as UtteranceDocType;
            return (
              <div
                key={`tr-sub-${layer.id}-${item.id}`}
                className="timeline-annotation-subtrack"
                style={{
                  top: 0,
                  height: baseLaneHeight,
                }}
              >
                {renderAnnotationItem(uttCompat, layer, draft, {
                  showSpeaker: false,
                  placeholder: isIndependent ? '独立段' : '翻译',
                  onFocus: () => {
                    focusedTranslationDraftKeyRef.current = draftKey;
                  },
                  onChange: (e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                    if (value.trim() && value !== text) {
                      scheduleAutoSave(`tr-${layer.id}-${item.id}`, async () => {
                        await saveTextTranslationForUtterance(item.id, value, layer.id);
                      });
                    } else {
                      clearAutoSaveTimer(`tr-${layer.id}-${item.id}`);
                    }
                  },
                  onBlur: (e) => {
                    focusedTranslationDraftKeyRef.current = null;
                    const value = normalizeSingleLine(e.target.value);
                    clearAutoSaveTimer(`tr-${layer.id}-${item.id}`);
                    if (value !== text) {
                      fireAndForget(saveTextTranslationForUtterance(item.id, value, layer.id));
                    }
                  },
                })}
              </div>
            );
          })}
          {!isCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, baseLaneHeight)}
            role="separator"
            aria-orientation="horizontal"
          />}
        </div>
      );})}

      {layerAction && (
        <LayerActionPopover
          action={layerAction.action}
          layerId={layerAction.layerId}
          deletableLayers={deletableLayers}
          createLayer={createLayer}
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
    </div>
  );
}