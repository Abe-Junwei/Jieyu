import type { TranslationLayerDocType, UtteranceDocType } from '../../db';
import { useState } from 'react';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { TimelineLaneHeader } from './TimelineLaneHeader';
import { LayerActionPopover } from './LayerActionPopover';
import { DEFAULT_TIMELINE_LANE_HEIGHT, useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';

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
}: Omit<TranscriptionTimelineMediaLanesProps, 'allLayersOrdered'> & {
  allLayersOrdered: TranslationLayerDocType[];
  deletableLayers: TranslationLayerDocType[];
  onFocusLayer: (layerId: string) => void;
  layerLinks?: Array<{ transcriptionLayerKey: string; tierId: string }>;
}) {
  const [layerAction, setLayerAction] = useState<{ action: LayerActionType; layerId?: string } | null>(null);
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(new Set());
  const { resizingLayerId, startLaneHeightResize } = useTimelineLaneHeightResize(onLaneHeightChange);

  const toggleLayerCollapsed = (layerId: string) => {
    setCollapsedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  };

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
        return (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${isCollapsed ? 14 : (laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => {
            if (isCollapsed) toggleLayerCollapsed(layer.id);
            e.preventDefault();
            e.stopPropagation();
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
            onLayerAction={(action, layerId) => setLayerAction({ action, layerId })}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? (() => {})}
            isCollapsed={isCollapsed}
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
          />
          {!isCollapsed && timelineRenderUtterances.map((utt) => {
            const sourceText = getUtteranceTextForLayer(utt, layer.id);
            const draftKey = `trc-${layer.id}-${utt.id}`;
            const legacyDraft = layer.id === defaultTranscriptionLayerId ? utteranceDrafts[utt.id] : undefined;
            const draft = utteranceDrafts[draftKey] ?? legacyDraft ?? sourceText;
            return renderAnnotationItem(utt, layer, draft, {
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
            });
          })}
          {!isCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}
            role="separator"
            aria-orientation="horizontal"
          />}
        </div>
      );})}
      {translationLayers.map((layer, idx) => {
        const isCollapsed = collapsedLayerIds.has(layer.id);
        return (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${isCollapsed ? 14 : (laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}px`,
          } as React.CSSProperties}
          onPointerDown={(e) => {
            if (isCollapsed) toggleLayerCollapsed(layer.id);
            e.preventDefault();
            e.stopPropagation();
          }}
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
            onLayerAction={(action, layerId) => setLayerAction({ action, layerId })}
            layerLinks={layerLinks}
            showConnectors={showConnectors}
            onToggleConnectors={onToggleConnectors ?? (() => {})}
            isCollapsed={isCollapsed}
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
          />
          {!isCollapsed && timelineRenderUtterances.map((utt) => {
            const text = translationTextByLayer.get(layer.id)?.get(utt.id)?.text ?? '';
            const draftKey = `${layer.id}-${utt.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            return renderAnnotationItem(utt, layer, draft, {
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
            });
          })}
          {!isCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}
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
    </div>
  );
}