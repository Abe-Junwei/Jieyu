import type { TranslationLayerDocType, UtteranceDocType } from '../db';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { TimelineLaneHeader } from './TimelineLaneHeader';
import { LayerActionPopover } from './LayerActionPopover';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { DEFAULT_TIMELINE_LANE_HEIGHT, useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import { buildSpeakerLayerLayout } from '../utils/speakerLayerLayout';

type LassoRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type TranscriptionTimelineMediaLanesProps = {
  playerDuration: number;
  zoomPxPerSec: number;
  lassoRect: LassoRect | null;
  transcriptionLayers: TranslationLayerDocType[];
  translationLayers: TranslationLayerDocType[];
  timelineRenderUtterances: UtteranceDocType[];
  flashLayerRowId: string;
  focusedLayerRowId: string;
  defaultTranscriptionLayerId: string | undefined;
  renderAnnotationItem: (
    utt: UtteranceDocType,
    layer: TranslationLayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>,
  ) => React.ReactNode;
  // TimelineLaneHeader props
  allLayersOrdered: TranslationLayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: TranslationLayerDocType[];
  onFocusLayer: (layerId: string) => void;
  layerLinks?: Array<{ transcriptionLayerKey: string; tierId: string }>;
  showConnectors?: boolean;
  onToggleConnectors?: () => void;
  laneHeights: Record<string, number>;
  onLaneHeightChange: (layerId: string, nextHeight: number) => void;
  // Lane label resize
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
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
  onLaneLabelWidthResize,
}: Omit<TranscriptionTimelineMediaLanesProps, 'allLayersOrdered'> & {
  allLayersOrdered: TranslationLayerDocType[];
  deletableLayers: TranslationLayerDocType[];
  onFocusLayer: (layerId: string) => void;
  layerLinks?: Array<{ transcriptionLayerKey: string; tierId: string }>;
}) {
  const [layerAction, setLayerAction] = useState<{ action: LayerActionType; layerId?: string } | null>(null);
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(new Set());
  const [tempExpandedGroupByLayer, setTempExpandedGroupByLayer] = useState<Record<string, string>>({});
  const tempExpandTimersRef = useRef<Map<string, number>>(new Map());
  const { resizingLayerId, startLaneHeightResize } = useTimelineLaneHeightResize(onLaneHeightChange);
  const speakerLayerLayout = useMemo(
    () => buildSpeakerLayerLayout(timelineRenderUtterances),
    [timelineRenderUtterances],
  );

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
        const isCollapsed = collapsedLayerIds.has(layer.id);
        const activeOverlapGroupId = tempExpandedGroupByLayer[layer.id];
        const isTemporarilyExpanded = typeof activeOverlapGroupId === 'string';
        const effectiveCollapsed = isCollapsed && !isTemporarilyExpanded;
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const expandedGroupMeta = activeOverlapGroupId
          ? speakerLayerLayout.overlapGroups.find((group) => group.id === activeOverlapGroupId)
          : undefined;
        const activeSubTrackCount = expandedGroupMeta?.subTrackCount ?? speakerLayerLayout.subTrackCount;
        const visibleLaneHeight = effectiveCollapsed ? 14 : baseLaneHeight * activeSubTrackCount;
        const collapsedOverlapMarkers = speakerLayerLayout.overlapGroups.filter((group) => group.speakerCount > 1);
        const visibleUtterances = !effectiveCollapsed && activeOverlapGroupId
          ? timelineRenderUtterances.filter((utt) => speakerLayerLayout.placements.get(utt.id)?.overlapGroupId === activeOverlapGroupId)
          : timelineRenderUtterances;
        return (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${effectiveCollapsed ? 'timeline-lane-collapsed' : ''} ${!effectiveCollapsed && speakerLayerLayout.subTrackCount > 1 ? 'timeline-lane-speaker-layered' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${visibleLaneHeight}px`,
            '--timeline-subtrack-height': `${baseLaneHeight}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => handleLanePointerDown(layer.id, effectiveCollapsed, e)}
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
            isCollapsed={effectiveCollapsed}
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
          />
          {isCollapsed && collapsedOverlapMarkers.map((group) => (
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
            const sourceText = getUtteranceTextForLayer(utt, layer.id);
            const draftKey = `trc-${layer.id}-${utt.id}`;
            const legacyDraft = layer.id === defaultTranscriptionLayerId ? utteranceDrafts[utt.id] : undefined;
            const draft = utteranceDrafts[draftKey] ?? legacyDraft ?? sourceText;
            const placement = speakerLayerLayout.placements.get(utt.id);
            const subTrackIndex = placement?.subTrackIndex ?? 0;
            return (
              <div
                key={`trc-sub-${layer.id}-${utt.id}`}
                className="timeline-annotation-subtrack"
                style={{
                  top: subTrackIndex * baseLaneHeight,
                  height: baseLaneHeight,
                }}
              >
                {renderAnnotationItem(utt, layer, draft, {
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
        const activeOverlapGroupId = tempExpandedGroupByLayer[layer.id];
        const isTemporarilyExpanded = typeof activeOverlapGroupId === 'string';
        const effectiveCollapsed = isCollapsed && !isTemporarilyExpanded;
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const expandedGroupMeta = activeOverlapGroupId
          ? speakerLayerLayout.overlapGroups.find((group) => group.id === activeOverlapGroupId)
          : undefined;
        const activeSubTrackCount = expandedGroupMeta?.subTrackCount ?? speakerLayerLayout.subTrackCount;
        const visibleLaneHeight = effectiveCollapsed ? 14 : baseLaneHeight * activeSubTrackCount;
        const collapsedOverlapMarkers = speakerLayerLayout.overlapGroups.filter((group) => group.speakerCount > 1);
        const visibleUtterances = !effectiveCollapsed && activeOverlapGroupId
          ? timelineRenderUtterances.filter((utt) => speakerLayerLayout.placements.get(utt.id)?.overlapGroupId === activeOverlapGroupId)
          : timelineRenderUtterances;
        return (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${effectiveCollapsed ? 'timeline-lane-collapsed' : ''} ${!effectiveCollapsed && speakerLayerLayout.subTrackCount > 1 ? 'timeline-lane-speaker-layered' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${visibleLaneHeight}px`,
            '--timeline-subtrack-height': `${baseLaneHeight}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => handleLanePointerDown(layer.id, effectiveCollapsed, e)}
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
            isCollapsed={effectiveCollapsed}
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
          />
            {isCollapsed && collapsedOverlapMarkers.map((group) => (
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
            const text = translationTextByLayer.get(layer.id)?.get(utt.id)?.text ?? '';
            const draftKey = `${layer.id}-${utt.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            const placement = speakerLayerLayout.placements.get(utt.id);
            const subTrackIndex = placement?.subTrackIndex ?? 0;
            return (
              <div
                key={`tr-sub-${layer.id}-${utt.id}`}
                className="timeline-annotation-subtrack"
                style={{
                  top: subTrackIndex * baseLaneHeight,
                  height: baseLaneHeight,
                }}
              >
                {renderAnnotationItem(utt, layer, draft, {
                  placeholder: '翻译',
                  onFocus: () => {
                    focusedTranslationDraftKeyRef.current = draftKey;
                  },
                  onChange: (e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                    if (value.trim() && value !== text) {
                      scheduleAutoSave(`tr-${layer.id}-${utt.id}`, async () => {
                        await saveTextTranslationForUtterance(utt.id, value, layer.id);
                      });
                    } else {
                      clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                    }
                  },
                  onBlur: (e) => {
                    focusedTranslationDraftKeyRef.current = null;
                    const value = normalizeSingleLine(e.target.value);
                    clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                    if (value !== text) {
                      fireAndForget(saveTextTranslationForUtterance(utt.id, value, layer.id));
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