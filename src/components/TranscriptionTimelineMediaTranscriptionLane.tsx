/**
 * TranscriptionTimelineMediaTranscriptionLane — 转写层轨道容器
 * Transcription layer lane shell with header, overlap hint, resize handle
 */

import { memo } from 'react';
import type React from 'react';
import type { LayerDocType, LayerLinkDocType, LayerDisplaySettings, OrthographyDocType, LayerUnitDocType, LayerUnitContentDocType, MediaItemDocType } from '../db';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import type { SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { TimelineLaneHeader } from './TimelineLaneHeader';
import { TranscriptionTimelineMediaTranscriptionRow } from './TranscriptionTimelineMediaTranscriptionRow';
import { TimelineStyledButton, TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { recordingScopeUnitId } from '../utils/recordingScopeUnitId';
import { t, useLocale } from '../i18n';

const COLLAPSED_OVERLAP_HINT_TRACK_WIDTH = 48;

interface TranscriptionLaneProps {
  layer: LayerDocType;
  layerIndex: number;
  zoomPxPerSec: number;
  flashLayerRowId: string;
  focusedLayerRowId: string;
  activeUnitId?: string;
  defaultTranscriptionLayerId?: string;
  allLayersOrdered: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
  onFocusLayer: (layerId: string) => void;
  layerLinks: LayerLinkDocType[];
  showConnectors: boolean;
  onToggleConnectors: () => void;
  trackDisplayMode: TranscriptionTrackDisplayMode;
  onToggleTrackDisplayMode?: () => void;
  onSetTrackDisplayMode?: (mode: TranscriptionTrackDisplayMode) => void;
  onLockSelectedSpeakersToLane?: (laneIndex: number) => void;
  onUnlockSelectedSpeakers?: () => void;
  onResetTrackAutoLayout?: () => void;
  selectedSpeakerNamesForLock?: string[];
  laneLockMap?: Record<string, number>;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof import('./LayerStyleSubmenu').buildLayerStyleMenuItems>[7];
  };
  // Lane state
  isCollapsed: boolean;
  effectiveCollapsed: boolean;
  baseLaneHeight: number;
  visibleLaneHeight: number;
  activeSubTrackCount: number;
  isMultiTrackMode: boolean;
  resizingLayerId: string | null;
  previewFontSize?: number;
  layerForDisplay: LayerDocType;
  activeLayerLayout: SpeakerLayerLayoutResult;
  collapsedOverlapMarkers: Array<{ id: string; speakerCount: number; centerTime: number }>;
  // Data
  visibleUnits: TimelineUnitView[];
  overlapCycleItemsByUnitId: Map<string, Array<{ id: string; startTime: number }>>;
  segmentSourceLayerId: string;
  segmentSpeakerIdByLayer: Map<string, Map<string, string>>;
  segmentContentByLayer?: Map<string, Map<string, { text?: string }>>;
  unitById: Map<string, LayerUnitDocType>;
  segmentById: Map<string, LayerUnitDocType>;
  activeOverlapGroupId?: string;
  // Editor bindings
  unitDrafts: Record<string, string>;
  getUnitTextForLayer: (utt: LayerUnitDocType, layerId: string) => string;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  scheduleAutoSave: (key: string, saveFn: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
  focusedTranslationDraftKeyRef: React.MutableRefObject<string | null>;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  mediaItemById: Map<string, MediaItemDocType>;
  recording: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
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
  renderLaneLabel: (layer: LayerDocType) => React.ReactNode;
  // Resize
  startLaneHeightResize: (
    event: React.PointerEvent<HTMLDivElement>,
    layerId: string,
    baseLaneHeight: number,
    edge?: 'top' | 'bottom',
  ) => void;
  // Callbacks
  handleLayerAction: (
    action:
      | 'create-transcription'
      | 'create-translation'
      | 'edit-transcription-metadata'
      | 'edit-translation-metadata'
      | 'delete',
    layerId?: string,
  ) => void;
  onToggleCollapsed: (layerId: string) => void;
  onActivateTemporaryExpand: (layerId: string, overlapGroupId: string) => void;
  onLanePointerDown: (layerId: string, isCollapsed: boolean, e: React.PointerEvent<HTMLDivElement>) => void;
}

export const TranscriptionTimelineMediaTranscriptionLane = memo(function TranscriptionTimelineMediaTranscriptionLane({
  layer,
  layerIndex,
  zoomPxPerSec,
  flashLayerRowId,
  focusedLayerRowId,
  defaultTranscriptionLayerId: _defaultTranscriptionLayerId,
  allLayersOrdered,
  onReorderLayers,
  deletableLayers,
  onFocusLayer,
  layerLinks,
  showConnectors,
  onToggleConnectors,
  trackDisplayMode,
  onToggleTrackDisplayMode,
  onSetTrackDisplayMode,
  onLockSelectedSpeakersToLane,
  onUnlockSelectedSpeakers,
  onResetTrackAutoLayout,
  selectedSpeakerNamesForLock,
  laneLockMap,
  speakerQuickActions,
  onLaneLabelWidthResize,
  displayStyleControl,
  isCollapsed,
  effectiveCollapsed,
  baseLaneHeight,
  visibleLaneHeight,
  isMultiTrackMode,
  resizingLayerId,
  layerForDisplay,
  activeLayerLayout,
  collapsedOverlapMarkers,
  visibleUnits,
  overlapCycleItemsByUnitId,
  segmentSourceLayerId,
  segmentSpeakerIdByLayer,
  segmentContentByLayer,
  unitById,
  segmentById,
  unitDrafts,
  getUnitTextForLayer,
  saveSegmentContentForLayer,
  scheduleAutoSave,
  clearAutoSaveTimer,
  saveUnitLayerText,
  focusedTranslationDraftKeyRef,
  translationAudioByLayer,
  mediaItemById,
  recording,
  recordingUnitId,
  recordingLayerId,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
  setUnitDrafts,
  renderAnnotationItem,
  renderLaneLabel,
  startLaneHeightResize,
  handleLayerAction,
  onToggleCollapsed,
  onActivateTemporaryExpand,
  onLanePointerDown,
}: TranscriptionLaneProps) {
  const locale = useLocale();

  return (
    <TimelineStyledContainer
      key={`tl-${layer.id}`}
      className={`timeline-lane ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''} ${layer.id === focusedLayerRowId ? 'timeline-lane-focused' : ''} ${resizingLayerId === layer.id ? 'timeline-lane-resizing' : ''} ${effectiveCollapsed ? 'timeline-lane-collapsed' : ''} ${isMultiTrackMode && !effectiveCollapsed && activeLayerLayout.subTrackCount > 1 ? 'timeline-lane-speaker-layered' : ''}`}
      layoutStyle={{
        '--timeline-lane-height': `${visibleLaneHeight}px`,
        '--timeline-subtrack-height': `${baseLaneHeight}px`,
      } as React.CSSProperties}
      onPointerDown={(e) => onLanePointerDown(layer.id, effectiveCollapsed, e)}
      onClick={(e) => {
        if (!onToggleTrackDisplayMode) return;
        if (e.target !== e.currentTarget) return;
        onToggleTrackDisplayMode();
      }}
    >
      <TimelineLaneHeader
        layer={layer}
        layerIndex={layerIndex}
        allLayers={allLayersOrdered}
        onReorderLayers={onReorderLayers}
        deletableLayers={deletableLayers}
        onFocusLayer={onFocusLayer}
        renderLaneLabel={renderLaneLabel}
        onLayerAction={handleLayerAction}
        layerLinks={layerLinks}
        showConnectors={showConnectors}
        onToggleConnectors={onToggleConnectors}
        headerMenuPreset="layer-chrome-plus-track"
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
            ...(activeLayerLayout.lockConflictCount > 0 ? { lockConflictCount: activeLayerLayout.lockConflictCount } : {}),
          },
        })}
        isCollapsed={effectiveCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        {...(onLaneLabelWidthResize && { onLaneLabelWidthResize })}
        {...(displayStyleControl && { displayStyleControl })}
      />
      {isMultiTrackMode && isCollapsed && collapsedOverlapMarkers.map((group) => (
        <TimelineStyledButton
          key={`ov-hint-${layer.id}-${group.id}`}
          type="button"
          className="timeline-lane-overlap-hint"
          title={t(locale, 'transcription.timeline.overlapTempExpand')}
          layoutStyle={{ left: Math.max(0, (group.centerTime * zoomPxPerSec) - (COLLAPSED_OVERLAP_HINT_TRACK_WIDTH / 2)) }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onActivateTemporaryExpand(layer.id, group.id);
          }}
        >
          {group.speakerCount}人
        </TimelineStyledButton>
      ))}
      {!effectiveCollapsed && visibleUnits.map((unit) => {
        const realUtt = unitById.get(unit.id);
        const sourceText = unit.kind === 'segment'
          ? (segmentContentByLayer?.get(layer.id)?.get(unit.id)?.text ?? '')
          : (realUtt ? getUnitTextForLayer(realUtt, layer.id) : unit.text);
        const draftKey = `trc-${layer.id}-${unit.id}`;
        const draft = unitDrafts[draftKey] ?? sourceText;
        const placement = activeLayerLayout.placements.get(unit.id);
        const overlapCycleItems = overlapCycleItemsByUnitId.get(unit.id);
        const overlapCycleStatus = overlapCycleItems && overlapCycleItems.length > 1
          ? {
              index: Math.max(1, overlapCycleItems.findIndex((item) => item.id === unit.id) + 1),
              total: overlapCycleItems.length,
            }
          : undefined;
        const subTrackTop = (isMultiTrackMode ? (placement?.subTrackIndex ?? 0) : 0) * baseLaneHeight;
        // Timeline rendering is TimelineUnitView-first; avoid doc-shape replacement by id.
        const uttForRender = unit;
        const scopeId = recordingScopeUnitId(uttForRender);
        const audioTranslation = translationAudioByLayer?.get(layer.id)?.get(scopeId);
        const audioMedia = audioTranslation?.translationAudioMediaId
          ? mediaItemById.get(audioTranslation.translationAudioMediaId)
          : undefined;
        return (
          <TranscriptionTimelineMediaTranscriptionRow
            key={`trc-sub-${layer.id}-${unit.id}`}
            utt={uttForRender}
            layer={layer}
            layerForDisplay={layerForDisplay}
            baseLaneHeight={baseLaneHeight}
            subTrackTop={subTrackTop}
            draft={draft}
            draftKey={draftKey}
            sourceText={sourceText}
            unitKind={unit.kind}
            unitById={unitById}
            segmentById={segmentById}
            {...(overlapCycleItems ? { overlapCycleItems } : {})}
            {...(overlapCycleStatus ? { overlapCycleStatus } : {})}
            saveSegmentContentForLayer={saveSegmentContentForLayer}
            scheduleAutoSave={scheduleAutoSave}
            clearAutoSaveTimer={clearAutoSaveTimer}
            saveUnitLayerText={saveUnitLayerText}
            focusedTranslationDraftKeyRef={focusedTranslationDraftKeyRef}
            {...(audioMedia ? { audioMedia } : {})}
            recording={recording}
            {...(recordingUnitId !== undefined && recordingUnitId !== null ? { recordingUnitId } : {})}
            {...(recordingLayerId !== undefined && recordingLayerId !== null ? { recordingLayerId } : {})}
            {...(startRecordingForUnit ? { startRecordingForUnit } : {})}
            {...(stopRecording ? { stopRecording } : {})}
            {...(deleteVoiceTranslation ? { deleteVoiceTranslation } : {})}
            setUnitDrafts={setUnitDrafts}
            renderAnnotationItem={renderAnnotationItem}
          />
        );
      })}
      {!effectiveCollapsed && <>
        <div
          className="timeline-lane-resize-handle timeline-lane-resize-handle-top"
          onPointerDown={(event) => startLaneHeightResize(event, layer.id, baseLaneHeight, 'top')}
          role="separator"
          aria-orientation="horizontal"
        />
        <div
          className="timeline-lane-resize-handle timeline-lane-resize-handle-bottom"
          onPointerDown={(event) => startLaneHeightResize(event, layer.id, baseLaneHeight, 'bottom')}
          role="separator"
          aria-orientation="horizontal"
        />
      </>}
    </TimelineStyledContainer>
  );
});

TranscriptionTimelineMediaTranscriptionLane.displayName = 'TranscriptionTimelineMediaTranscriptionLane';
