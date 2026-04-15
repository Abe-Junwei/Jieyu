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
import { memo, useCallback, useMemo, useState } from 'react';
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
import {
  BASE_FONT_SIZE,
  computeFontSizeFromRenderPolicy,
  layerDisplaySettingsToStyle,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import type { SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { utteranceToView, segmentToView } from '../hooks/timelineUnitView';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { TranscriptionTimelineTextTranslationItem } from './TranscriptionTimelineTextTranslationItem';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import {
  buildSegmentSpeakerLayoutMaps,
  EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID,
  EMPTY_SPEAKER_LAYOUT,
  normalizeSpeakerFocusKey,
  resolveSpeakerFocusKeyFromSegment,
} from './transcriptionTimelineSegmentSpeakerLayout';
import { t, tf, useLocale } from '../i18n';
import {
  resolveSelfCertaintyHostUtteranceId,
  type UtteranceSelfCertainty,
} from '../utils/utteranceSelfCertainty';
import { MaterialSymbol } from './ui/MaterialSymbol';

function buildTextTimelineSelfCertaintyTitle(
  locale: Parameters<typeof t>[0],
  value: UtteranceSelfCertainty,
): string {
  const tier = value === 'certain'
    ? t(locale, 'transcription.utterance.selfCertainty.certain')
    : value === 'uncertain'
      ? t(locale, 'transcription.utterance.selfCertainty.uncertain')
      : t(locale, 'transcription.utterance.selfCertainty.not_understood');
  return `${tier}\n${t(locale, 'transcription.utterance.selfCertainty.dimensionHint')}`;
}

function getSegmentTimelineItems(
  layer: LayerDocType,
  layerById: ReadonlyMap<string, LayerDocType>,
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]> | undefined,
  utterancesOnCurrentMedia: UtteranceDocType[],
  defaultTranscriptionLayerId?: string,
): Array<{ id: string; startTime: number }> {
  const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
  if (!sourceLayer) {
    return utterancesOnCurrentMedia;
  }

  return (segmentsByLayer?.get(sourceLayer.id) ?? []) as Array<{ id: string; startTime: number }>;
}

type TranscriptionTimelineTextOnlyProps = {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  segmentsByLayer?: Map<string, LayerSegmentDocType[]>;
  segmentContentByLayer?: Map<string, Map<string, LayerSegmentContentDocType>>;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  selectedTimelineUnit?: TimelineUnit | null;
  flashLayerRowId: string;
  focusedLayerRowId: string;
  defaultTranscriptionLayerId?: string;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: Array<{ id: string; startTime: number }>,
  ) => void;
  handleAnnotationContextMenu?: (
    uttId: string,
    utt: UtteranceDocType | LayerSegmentDocType,
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
  speakerVisualByUtteranceId?: Record<string, { name: string; color: string }>;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  // Lane label resize
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
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

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

export const TranscriptionTimelineTextOnly = memo(function TranscriptionTimelineTextOnly({
  transcriptionLayers,
  translationLayers,
  utterancesOnCurrentMedia,
  segmentsByLayer,
  segmentContentByLayer,
  saveSegmentContentForLayer,
  selectedTimelineUnit,
  flashLayerRowId,
  focusedLayerRowId,
  defaultTranscriptionLayerId,
  scrollContainerRef,
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
  activeUnitId,
  activeSpeakerFilterKey = 'all',
  speakerVisualByUtteranceId = {},
  speakerQuickActions,
  onLaneLabelWidthResize,
  translationAudioByLayer,
  mediaItems = [],
  recording = false,
  recordingUtteranceId = null,
  recordingLayerId = null,
  startRecordingForUtterance,
  stopRecording,
  deleteVoiceTranslation,
  displayStyleControl,
}: TranscriptionTimelineTextOnlyProps) {
  const locale = useLocale();
  const [layerAction, setLayerAction] = useState<{ action: LayerActionType; layerId?: string } | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [saveStatusByCellKey, setSaveStatusByCellKey] = useState<Record<string, 'dirty' | 'saving' | 'error'>>({});
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(new Set());
  const [previewFontSizeByLayerId, setPreviewFontSizeByLayerId] = useState<Record<string, number>>({});

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

  const horizontalVirtualizer = useVirtualizer({
    count: utterancesOnCurrentMedia.length,
    horizontal: true,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 180,
    overscan: 10,
  });

  const virtualItems = horizontalVirtualizer.getVirtualItems();
  const totalSize = horizontalVirtualizer.getTotalSize();
  const utteranceById = new Map(utterancesOnCurrentMedia.map((item) => [item.id, item] as const));
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
    utteranceById,
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
    utteranceById,
  ]);

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

  return (
    <div className={`timeline-content timeline-content-text-only${editingCellKey ? ' timeline-content-editing' : ''}`}>
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
        const defaultLayerId = defaultTranscriptionLayerId ?? '';
        const rawLayerItems = usesSegmentTimeline
          ? (segmentsByLayer?.get(segmentSourceLayerId) ?? []).filter((segment) => (
              activeSpeakerFilterKey === 'all'
                || resolveSpeakerFocusKeyFromSegment(segment, utteranceById) === normalizeSpeakerFocusKey(activeSpeakerFilterKey)
            ))
          : utterancesOnCurrentMedia;
        const layerUnits: TimelineUnitView[] = usesSegmentTimeline
          ? rawLayerItems.map((s) => segmentToView(s as LayerSegmentDocType, () => ''))
          : rawLayerItems.map((u) => utteranceToView(u as UtteranceDocType, defaultLayerId));
        const laneVirtualItems: Array<{ index: number; size: number; start: number }> = usesSegmentTimeline
          ? layerUnits.map((_, index) => ({ index, size: 180, start: index * 180 }))
          : virtualItems.map((it) => ({ index: it.index, size: it.size, start: it.start }));
        const laneTotalSize = usesSegmentTimeline ? layerUnits.length * 180 : totalSize;
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
        const overlapCycleItemsByUtteranceId = isMultiTrackMode
          ? (activeLayout.overlapCycleItemsByGroupId.get('__all__') ?? EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID)
          : EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID;
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
          {!isCollapsed && <div className="timeline-lane-text-only-track">
          {laneVirtualItems.map((virtualItem) => {
            const unit = layerUnits[virtualItem.index];
            if (!unit) return null;
            const realUtt = utteranceById.get(unit.id);
            const speakerVisual = speakerVisualByUtteranceId[unit.id];
            const sourceText = unit.kind === 'segment'
              ? (segmentContentByLayer?.get(layer.id)?.get(unit.id)?.text ?? '')
              : (realUtt ? getUtteranceTextForLayer(realUtt, layer.id) : unit.text);
            const draftKey = `trc-${layer.id}-${unit.id}`;
            const cellKey = `text-${layer.id}-${unit.id}`;
            const draft = utteranceDrafts[draftKey] ?? sourceText;
            const isEditing = editingCellKey === cellKey;
            const isDimmed = !!editingCellKey && !isEditing;
            const saveStatus = saveStatusByCellKey[cellKey];
            const retrySave = () => {
              if (draft === sourceText) {
                setCellSaveStatus(cellKey);
                return;
              }
              fireAndForget(runSaveWithStatus(cellKey, async () => {
                await saveUtteranceText(unit.id, draft, layer.id);
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
            const uttForContext = realUtt ?? unit as unknown as UtteranceDocType;
            const certaintyHostId = unit.kind === 'segment'
              ? resolveSelfCertaintyHostUtteranceId(unit.id, utterancesOnCurrentMedia, {
                  parentUtteranceId: unit.parentUtteranceId,
                  startTime: unit.startTime,
                  endTime: unit.endTime,
                })
              : unit.id.trim();
            const certaintyHostUtt = certaintyHostId ? utteranceById.get(certaintyHostId) : undefined;
            const cellSelfCertainty = certaintyHostUtt?.selfCertainty;
            const selfCertaintyTitle = cellSelfCertainty
              ? buildTextTimelineSelfCertaintyTitle(locale, cellSelfCertainty)
              : undefined;
            return (
              <TimelineStyledContainer
                key={unit.id}
                className={`timeline-text-item${isActive ? ' timeline-text-item-active' : ''}${isEditing ? ' timeline-text-item-editing' : ''}${isDimmed ? ' timeline-text-item-dimmed' : ''}${!draft.trim() && !isEditing ? ' timeline-text-item-empty' : ''}${saveStatus ? ` timeline-text-item-${saveStatus}` : ''}${confidenceClass}${speakerVisual ? ' timeline-text-item-has-speaker' : ''}${cellSelfCertainty ? ' timeline-text-item-has-self-certainty' : ''}`}
                layoutStyle={{
                  width: `${virtualItem.size}px`,
                  transform: `translateX(${virtualItem.start}px)`,
                  ...(unit.kind === 'segment' && isMultiTrackMode ? { top: subTrackIndex * baseLaneHeight, height: baseLaneHeight } : {}),
                  ...(speakerVisual ? ({ '--speaker-color': speakerVisual.color } as React.CSSProperties) : {}),
                  ...layerDisplaySettingsToStyle(displaySettingsForRender, renderPolicy),
                }}
                dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
                title={speakerVisual ? tf(locale, 'transcription.timeline.speakerTitle', { name: speakerVisual.name }) : undefined}
                onClick={(e) => handleAnnotationClick(unit.id, unit.startTime, layer.id, e, overlapCycleItemsByUtteranceId.get(unit.id))}
                onContextMenu={(e) => handleAnnotationContextMenu?.(unit.id, uttForContext, layer.id, e)}
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
                <input
                  type="text"
                  className="timeline-text-input"
                  placeholder={unit.kind === 'segment' ? t(locale, 'transcription.timeline.placeholder.segment') : undefined}
                  value={draft}
                  dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
                  onContextMenu={(e) => handleAnnotationContextMenu?.(unit.id, uttForContext, layer.id, e)}
                  onFocus={() => {
                    setEditingCellKey(cellKey);
                    onFocusLayer(layer.id);
                  }}
                  onChange={(e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: value }));
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
                          await saveUtteranceText(unit.id, value, layer.id);
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
                      setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: sourceText }));
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
                        await saveUtteranceText(unit.id, value, layer.id);
                      }));
                    } else {
                      setCellSaveStatus(cellKey);
                    }
                  }}
                />
                {cellSelfCertainty === 'certain' && selfCertaintyTitle ? (
                  <span
                    className="timeline-annotation-self-certainty timeline-annotation-self-certainty--certain"
                    title={selfCertaintyTitle}
                    aria-label={selfCertaintyTitle}
                  >
                    <MaterialSymbol name="check" aria-hidden className="timeline-annotation-self-certainty-icon" />
                  </span>
                ) : null}
                {cellSelfCertainty === 'not_understood' && selfCertaintyTitle ? (
                  <span
                    className="timeline-annotation-self-certainty timeline-annotation-self-certainty--not-understood"
                    title={selfCertaintyTitle}
                    aria-label={selfCertaintyTitle}
                  >
                    <MaterialSymbol name="question_mark" aria-hidden className="timeline-annotation-self-certainty-icon" />
                  </span>
                ) : null}
                {cellSelfCertainty === 'uncertain' && selfCertaintyTitle ? (
                  <span
                    className="timeline-annotation-self-certainty timeline-annotation-self-certainty--uncertain"
                    title={selfCertaintyTitle}
                    aria-label={selfCertaintyTitle}
                  >
                    <span className="timeline-annotation-self-certainty-wavy" aria-hidden>
                      {'\u2248'}
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
          utterancesOnCurrentMedia,
          defaultTranscriptionLayerId,
        );
        const usesSegmentTimeline = layerItems !== utterancesOnCurrentMedia;
        const laneVirtualItems: Array<{ index: number; size: number; start: number }> = usesSegmentTimeline
          ? layerItems.map((_, index) => ({ index, size: 180, start: index * 180 }))
          : virtualItems.map((it) => ({ index: it.index, size: it.size, start: it.start }));
        const laneTotalSize = usesSegmentTimeline ? layerItems.length * 180 : totalSize;
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
            const rawItem = layerItems[virtualItem.index];
            if (!rawItem) return null;
            const utt = rawItem as UtteranceDocType;
            const text = usesOwnSegments
              ? (segmentContentByLayer?.get(layer.id)?.get(utt.id)?.text ?? '')
              : (translationTextByLayer.get(layer.id)?.get(utt.id)?.text ?? '');
            const audioTranslation = translationAudioByLayer?.get(layer.id)?.get(utt.id);
            const audioMedia = audioTranslation?.translationAudioMediaId
              ? mediaItemById.get(audioTranslation.translationAudioMediaId)
              : undefined;
            const draftKey = `${layer.id}-${utt.id}`;
            const cellKey = `tr-${layer.id}-${utt.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            const isEditing = editingCellKey === cellKey;
            const isDimmed = !!editingCellKey && !isEditing;
            const saveStatus = saveStatusByCellKey[cellKey];
            const isActive = selectedTimelineUnit?.layerId === layer.id
              && selectedTimelineUnit.unitId === utt.id;
            const trHostUtt = usesOwnSegments
              ? (() => {
                  const seg = utt as LayerSegmentDocType;
                  const hid = resolveSelfCertaintyHostUtteranceId(seg.id, utterancesOnCurrentMedia, {
                    parentUtteranceId: seg.utteranceId,
                    startTime: seg.startTime,
                    endTime: seg.endTime,
                  });
                  return hid ? utteranceById.get(hid) : undefined;
                })()
              : utteranceById.get(utt.id);
            const trSelfCertainty = trHostUtt?.selfCertainty;
            const trSelfCertaintyTitle = trSelfCertainty
              ? buildTextTimelineSelfCertaintyTitle(locale, trSelfCertainty)
              : undefined;
            return (
              <TranscriptionTimelineTextTranslationItem
                key={utt.id}
                utt={utt}
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
                layoutStyle={{
                  width: `${virtualItem.size}px`,
                  transform: `translateX(${virtualItem.start}px)`,
                  ...layerDisplaySettingsToStyle(displaySettingsForRender, renderPolicy),
                }}
                dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
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
});
