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
import { useCallback, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SpeakerFocusMode, TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
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
import { TranscriptionTimelineTextTranslationItem } from './TranscriptionTimelineTextTranslationItem';
import {
  buildSegmentSpeakerLayoutMaps,
  EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID,
  EMPTY_SPEAKER_LAYOUT,
  normalizeSpeakerFocusKey,
  resolveSpeakerFocusKeyFromSegment,
  resolveSpeakerFocusKeyFromUtterance,
} from './transcriptionTimelineSegmentSpeakerLayout';
import { t, tf, useLocale } from '../i18n';

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
    utt: Pick<UtteranceDocType, 'id' | 'startTime' | 'endTime' | 'speaker' | 'speakerId' | 'ai_metadata'>,
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
  navigateUtteranceFromInput: (e: React.KeyboardEvent<HTMLInputElement>, direction: -1 | 1) => void;
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
  activeUtteranceUnitId?: string;
  speakerFocusMode?: SpeakerFocusMode;
  speakerFocusSpeakerKey?: string;
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

export function TranscriptionTimelineTextOnly({
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
  navigateUtteranceFromInput,
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
  activeUtteranceUnitId,
  speakerFocusMode = 'all',
  speakerFocusSpeakerKey,
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
        const layerItems: Array<{ id: string; startTime: number }> = usesSegmentTimeline
          ? (((segmentsByLayer?.get(segmentSourceLayerId) ?? []).filter((segment) => (
              activeSpeakerFilterKey === 'all'
                || resolveSpeakerFocusKeyFromSegment(segment, utteranceById) === normalizeSpeakerFocusKey(activeSpeakerFilterKey)
            ))) as Array<{ id: string; startTime: number }>)
          : utterancesOnCurrentMedia;
        const laneVirtualItems: Array<{ index: number; size: number; start: number }> = usesSegmentTimeline
          ? layerItems.map((_, index) => ({ index, size: 180, start: index * 180 }))
          : virtualItems.map((it) => ({ index: it.index, size: it.size, start: it.start }));
        const laneTotalSize = usesSegmentTimeline ? layerItems.length * 180 : totalSize;
        const baseLaneHeight = laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT;
        const subTrackCount = usesSegmentTimeline && isMultiTrackMode
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
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-text-only ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''} ${usesSegmentTimeline && isMultiTrackMode && activeLayout.subTrackCount > 1 ? 'timeline-lane-speaker-layered' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${visibleLaneHeight}px`,
            '--timeline-lane-content-height': `${Math.max(16, (baseLaneHeight - 12))}px`,
            '--timeline-subtrack-height': `${baseLaneHeight}px`,
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
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
            {...(displayStyleControl && { displayStyleControl })}
          />
          {!isCollapsed && <div className="timeline-lane-text-only-track" style={{ width: `${laneTotalSize}px` }}>
          {laneVirtualItems.map((virtualItem) => {
            const rawItem = layerItems[virtualItem.index];
            if (!rawItem) return null;
            const utt = rawItem as UtteranceDocType;
            const utteranceSpeakerKey = usesSegmentTimeline
              ? (segmentSpeakerIdByLayer.get(segmentSourceLayerId)?.get(utt.id) ?? 'unknown-speaker')
              : resolveSpeakerFocusKeyFromUtterance(utt);
            const focusMatched = speakerFocusMode === 'all' || !speakerFocusSpeakerKey || utteranceSpeakerKey === speakerFocusSpeakerKey;
            const shouldHideForFocus = speakerFocusMode === 'focus-hard' && !focusMatched;
            const shouldDimForFocus = speakerFocusMode === 'focus-soft' && !focusMatched;
            const speakerVisual = speakerVisualByUtteranceId[utt.id];
            const sourceText = usesSegmentTimeline
              ? (segmentContentByLayer?.get(layer.id)?.get(utt.id)?.text ?? '')
              : getUtteranceTextForLayer(utt, layer.id);
            const draftKey = `trc-${layer.id}-${utt.id}`;
            const cellKey = `text-${layer.id}-${utt.id}`;
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
                await saveUtteranceText(utt.id, draft, layer.id);
              }));
            };
            const isActive = selectedTimelineUnit?.layerId === layer.id
              && selectedTimelineUnit.unitId === utt.id;
            const subTrackIndex = usesSegmentTimeline && isMultiTrackMode
              ? (activeLayout.placements.get(utt.id)?.subTrackIndex ?? 0)
              : 0;
            return (
              <div
                key={utt.id}
                className={`timeline-text-item${isActive ? ' timeline-text-item-active' : ''}${isEditing ? ' timeline-text-item-editing' : ''}${isDimmed ? ' timeline-text-item-dimmed' : ''}${saveStatus ? ` timeline-text-item-${saveStatus}` : ''}${speakerVisual ? ' timeline-text-item-has-speaker' : ''}${shouldHideForFocus ? ' timeline-text-item-focus-hidden' : ''}${shouldDimForFocus ? ' timeline-text-item-focus-dim' : ''}`}
                style={{
                  width: `${virtualItem.size}px`,
                  transform: `translateX(${virtualItem.start}px)`,
                  ...(usesSegmentTimeline && isMultiTrackMode ? { top: subTrackIndex * baseLaneHeight, height: baseLaneHeight } : {}),
                  ...(speakerVisual ? ({ '--speaker-color': speakerVisual.color } as React.CSSProperties) : {}),
                  ...layerDisplaySettingsToStyle(displaySettingsForRender, renderPolicy),
                }}
                dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
                title={speakerVisual ? tf(locale, 'transcription.timeline.speakerTitle', { name: speakerVisual.name }) : undefined}
                onClick={(e) => handleAnnotationClick(utt.id, utt.startTime, layer.id, e, overlapCycleItemsByUtteranceId.get(utt.id))}
                onContextMenu={(e) => handleAnnotationContextMenu?.(utt.id, utt, layer.id, e)}
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
                  placeholder={usesSegmentTimeline ? t(locale, 'transcription.timeline.placeholder.segment') : undefined}
                  value={draft}
                  dir={renderPolicy?.preferDirAttribute ? renderPolicy.textDirection : undefined}
                  onContextMenu={(e) => handleAnnotationContextMenu?.(utt.id, utt, layer.id, e)}
                  onFocus={() => {
                    setEditingCellKey(cellKey);
                    onFocusLayer(layer.id);
                  }}
                  onChange={(e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: value }));
                    if (usesSegmentTimeline) {
                      if (!saveSegmentContentForLayer) return;
                      setCellSaveStatus(cellKey, 'dirty');
                      scheduleAutoSave(`seg-${layer.id}-${utt.id}`, async () => {
                        await runSaveWithStatus(cellKey, async () => {
                          await saveSegmentContentForLayer(utt.id, layer.id, value);
                        });
                      });
                      return;
                    }
                    if (value !== sourceText) {
                      setCellSaveStatus(cellKey, 'dirty');
                      scheduleAutoSave(`utt-${layer.id}-${utt.id}`, async () => {
                        await runSaveWithStatus(cellKey, async () => {
                          await saveUtteranceText(utt.id, value, layer.id);
                        });
                      });
                    } else {
                      clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
                      setCellSaveStatus(cellKey);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Tab') {
                      navigateUtteranceFromInput(e, e.shiftKey ? -1 : 1);
                      return;
                    }
                    if (e.key === 'Enter') {
                      navigateUtteranceFromInput(e, e.shiftKey ? -1 : 1);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
                      setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: sourceText }));
                      setCellSaveStatus(cellKey);
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => {
                    setEditingCellKey((prev) => (prev === cellKey ? null : prev));
                    const value = normalizeSingleLine(e.target.value);
                    if (usesSegmentTimeline) {
                      clearAutoSaveTimer(`seg-${layer.id}-${utt.id}`);
                      if (value !== sourceText && saveSegmentContentForLayer) {
                        fireAndForget(runSaveWithStatus(cellKey, async () => {
                          await saveSegmentContentForLayer(utt.id, layer.id, value);
                        }));
                      } else {
                        setCellSaveStatus(cellKey);
                      }
                      return;
                    }
                    clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
                    if (value !== sourceText) {
                      fireAndForget(runSaveWithStatus(cellKey, async () => {
                        await saveUtteranceText(utt.id, value, layer.id);
                      }));
                    } else {
                      setCellSaveStatus(cellKey);
                    }
                  }}
                />
              </div>
            );
          })}
          </div>}
          {!isCollapsed && <div
            className="timeline-lane-resize-handle"
            onPointerDown={(event) => startLaneHeightResize(event, layer.id, laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}
            role="separator"
            aria-orientation="horizontal"
          />}
        </div>
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
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-text-only timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${isCollapsed ? 'timeline-lane-collapsed' : ''}`}
          style={{
            position: 'relative',
            '--timeline-lane-height': `${isCollapsed ? 14 : (laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)}px`,
            '--timeline-lane-content-height': `${Math.max(16, ((isCollapsed ? 14 : (laneHeights[layer.id] ?? DEFAULT_TIMELINE_LANE_HEIGHT)) - 12))}px`,
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
            onToggleCollapsed={() => toggleLayerCollapsed(layer.id)}
            {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
            {...(displayStyleControl && { displayStyleControl })}
          />
          {!isCollapsed && <div className="timeline-lane-text-only-track" style={{ width: `${laneTotalSize}px` }}>
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
                style={{
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
                navigateUtteranceFromInput={navigateUtteranceFromInput}
                handleAnnotationClick={handleAnnotationClick}
                handleAnnotationContextMenu={handleAnnotationContextMenu}
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
        </div>
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
}
