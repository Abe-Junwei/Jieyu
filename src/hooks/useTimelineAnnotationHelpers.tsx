import { useCallback } from 'react';
import { TimelineAnnotationItem, type TimelineAnnotationItemProps } from '../components/TimelineAnnotationItem';
import type { LayerDocType, UtteranceDocType } from '../db';
import { createTimelineUnit, isUtteranceTimelineUnit, type TimelineUnit } from './transcriptionTypes';
import { formatTime, getLayerLabelParts } from '../utils/transcriptionFormatters';

type TimelineUtterance = Pick<UtteranceDocType, 'id' | 'startTime' | 'endTime' | 'speaker' | 'speakerId' | 'ai_metadata'>;

type SpeakerVisual = {
  name: string;
  color: string;
};

type CtxMenuState = {
  x: number;
  y: number;
  utteranceId: string;
  layerId: string;
  splitTime: number;
} | null;

type TimelineDragPreview = {
  id: string;
  start: number;
  end: number;
} | null;

type OverlapCycleItem = {
  id: string;
  startTime: number;
};

type UseTimelineAnnotationHelpersParams = {
  manualSelectTsRef: React.MutableRefObject<number>;
  player: {
    isPlaying: boolean;
    stop: () => void;
    seekTo: (time: number) => void;
  };
  selectedTimelineUnit?: TimelineUnit | null;
  selectUtteranceRange: (startId: string, endId: string) => void;
  toggleUtteranceSelection: (id: string) => void;
  selectTimelineUnit?: (unit: TimelineUnit | null) => void;
  selectUtterance: (id: string) => void;
  selectSegment: (id: string) => void;
  setSelectedLayerId: (id: string) => void;
  onFocusLayerRow: (id: string) => void;
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
  zoomPxPerSec: number;
  setCtxMenu: React.Dispatch<React.SetStateAction<CtxMenuState>>;
  navigateUtteranceFromInput: (e: React.KeyboardEvent<HTMLInputElement>, direction: -1 | 1) => void;
  waveformAreaRef: React.RefObject<HTMLDivElement | null>;
  dragPreview: TimelineDragPreview;
  selectedUtteranceIds: Set<string>;
  focusedLayerRowId: string;
  zoomToUtterance: (start: number, end: number) => void;
  startTimelineResizeDrag: (
    event: React.PointerEvent<HTMLElement>,
    utterance: TimelineUtterance,
    edge: 'start' | 'end',
    layerId: string,
  ) => void;
  noteCounts: Map<string, number>;
  handleNoteClick: (utteranceId: string, layerId: string, event: React.MouseEvent) => void;
  speakerVisualByUtteranceId?: Record<string, SpeakerVisual>;
  onOverlapCycleToast?: (index: number, total: number, utteranceId: string) => void;
  independentLayerIds?: Set<string>;
};

export function useTimelineAnnotationHelpers({
  manualSelectTsRef,
  player,
  selectedTimelineUnit,
  selectUtteranceRange,
  toggleUtteranceSelection,
  selectTimelineUnit,
  selectUtterance,
  selectSegment,
  setSelectedLayerId,
  onFocusLayerRow,
  tierContainerRef,
  zoomPxPerSec,
  setCtxMenu,
  navigateUtteranceFromInput,
  waveformAreaRef,
  dragPreview,
  selectedUtteranceIds,
  focusedLayerRowId,
  zoomToUtterance,
  startTimelineResizeDrag,
  noteCounts,
  handleNoteClick,
  speakerVisualByUtteranceId = {},
  onOverlapCycleToast,
  independentLayerIds = new Set<string>(),
}: UseTimelineAnnotationHelpersParams) {
  const handleAnnotationClick = useCallback((
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: OverlapCycleItem[],
  ) => {
    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) player.stop();
    const isIndependentLayer = independentLayerIds.has(layerId);
    if (isIndependentLayer) {
      if (selectTimelineUnit) {
        selectTimelineUnit(createTimelineUnit(layerId, uttId, 'segment'));
      } else {
        selectSegment(uttId);
      }
      player.seekTo(uttStartTime);
      setSelectedLayerId(layerId);
      onFocusLayerRow(layerId);
      return;
    }
    const selectedUtteranceUnitId = isUtteranceTimelineUnit(selectedTimelineUnit)
      ? selectedTimelineUnit.unitId
      : '';
    if (e.shiftKey && selectedUtteranceUnitId) {
      selectUtteranceRange(selectedUtteranceUnitId, uttId);
    } else if (e.metaKey || e.ctrlKey) {
      toggleUtteranceSelection(uttId);
    } else if (
      selectedUtteranceUnitId === uttId
      && overlapCycleItems
      && overlapCycleItems.length > 1
    ) {
      const index = overlapCycleItems.findIndex((item) => item.id === uttId);
      const next = overlapCycleItems[(index + 1) % overlapCycleItems.length];
      if (next) {
        selectUtterance(next.id);
        player.seekTo(next.startTime);
        onOverlapCycleToast?.(
          Math.max(1, ((index + 1) % overlapCycleItems.length) + 1),
          overlapCycleItems.length,
          next.id,
        );
      }
    } else {
      if (selectTimelineUnit) {
        selectTimelineUnit(createTimelineUnit(layerId, uttId, 'utterance'));
      } else {
        selectUtterance(uttId);
      }
      player.seekTo(uttStartTime);
    }
    setSelectedLayerId(layerId);
    onFocusLayerRow(layerId);
  }, [
    manualSelectTsRef,
    player,
    selectUtteranceRange,
    selectedTimelineUnit,
    independentLayerIds,
    toggleUtteranceSelection,
    selectUtterance,
    selectTimelineUnit,
    selectSegment,
    setSelectedLayerId,
    onFocusLayerRow,
    onOverlapCycleToast,
  ]);

  const handleAnnotationContextMenu = useCallback((
    uttId: string,
    utt: TimelineUtterance,
    layerId: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) player.stop();
    if (independentLayerIds.has(layerId)) {
      if (selectTimelineUnit) {
        selectTimelineUnit(createTimelineUnit(layerId, uttId, 'segment'));
      } else {
        selectSegment(uttId);
      }
    } else {
      if (selectTimelineUnit) {
        selectTimelineUnit(createTimelineUnit(layerId, uttId, 'utterance'));
      } else {
        selectUtterance(uttId);
      }
    }
    setSelectedLayerId(layerId);
    onFocusLayerRow(layerId);
    const sc = tierContainerRef.current;
    let splitTime = utt.startTime;
    if (sc && zoomPxPerSec > 0) {
      const rect = sc.getBoundingClientRect();
      const contentX = e.clientX - rect.left + sc.scrollLeft;
      splitTime = contentX / zoomPxPerSec;
    }
    const min = utt.startTime + 0.001;
    const max = utt.endTime - 0.001;
    splitTime = Math.max(min, Math.min(max, splitTime));
    setCtxMenu({ x: e.clientX, y: e.clientY, utteranceId: uttId, layerId, splitTime });
  }, [
    manualSelectTsRef,
    player,
    independentLayerIds,
    selectTimelineUnit,
    selectUtterance,
    selectSegment,
    setSelectedLayerId,
    onFocusLayerRow,
    tierContainerRef,
    zoomPxPerSec,
    setCtxMenu,
  ]);

  const handleAnnotationKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Tab') {
      navigateUtteranceFromInput(e, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Enter') {
      navigateUtteranceFromInput(e, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      waveformAreaRef.current?.focus();
    }
  }, [navigateUtteranceFromInput, waveformAreaRef]);

  const renderAnnotationItem = useCallback((
    utt: TimelineUtterance,
    layer: LayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>
      & {
        showSpeaker?: boolean;
        overlapCycleItems?: OverlapCycleItem[];
        overlapCycleStatus?: { index: number; total: number };
      },
  ) => {
    const { showSpeaker = true, overlapCycleItems, overlapCycleStatus, ...itemExtra } = extra;
    const dpStart = dragPreview?.id === utt.id ? dragPreview.start : utt.startTime;
    const dpEnd = dragPreview?.id === utt.id ? dragPreview.end : utt.endTime;
    const speakerVisual = showSpeaker ? speakerVisualByUtteranceId[utt.id] : undefined;
    return (
      <TimelineAnnotationItem
        key={utt.id}
        left={dpStart * zoomPxPerSec}
        width={Math.max(4, (dpEnd - dpStart) * zoomPxPerSec)}
        isSelected={selectedUtteranceIds.has(utt.id)}
        isActive={
          layer.id === focusedLayerRowId
            && selectedTimelineUnit?.layerId === layer.id
            && selectedTimelineUnit.unitId === utt.id
        }
        isCompact={(dpEnd - dpStart) * zoomPxPerSec < 36}
        title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}${speakerVisual ? ` | 说话人：${speakerVisual.name}` : ''}`}
        draft={draft}
        speakerLabel={speakerVisual?.name ?? ''}
        speakerColor={speakerVisual?.color ?? '#2563eb'}
        {...(overlapCycleStatus ? { overlapCycleIndicator: overlapCycleStatus } : {})}
        {...(utt.ai_metadata?.confidence != null ? { confidence: utt.ai_metadata.confidence } : {})}
        onClick={(e) => handleAnnotationClick(utt.id, utt.startTime, layer.id, e, overlapCycleItems)}
        onContextMenu={(e) => handleAnnotationContextMenu(utt.id, utt, layer.id, e)}
        onDoubleClick={() => zoomToUtterance(utt.startTime, utt.endTime)}
        onResizeStartPointerDown={(e) => startTimelineResizeDrag(e, utt, 'start', layer.id)}
        onResizeEndPointerDown={(e) => startTimelineResizeDrag(e, utt, 'end', layer.id)}
        onKeyDown={handleAnnotationKeyDown}
        noteCount={noteCounts.get(`${utt.id}::${layer.id}`) ?? 0}
        onNoteClick={(e) => handleNoteClick(utt.id, layer.id, e)}
        {...itemExtra}
      />
    );
  }, [
    dragPreview,
    zoomPxPerSec,
    selectedUtteranceIds,
    selectedTimelineUnit,
    focusedLayerRowId,
    independentLayerIds,
    handleAnnotationClick,
    handleAnnotationContextMenu,
    zoomToUtterance,
    startTimelineResizeDrag,
    handleAnnotationKeyDown,
    noteCounts,
    handleNoteClick,
    speakerVisualByUtteranceId,
  ]);

  const renderLaneLabel = useCallback((layer: LayerDocType) => {
    const parts = getLayerLabelParts(layer);
    if (parts.alias) {
      return <>{parts.type}<br />{parts.lang}<br />{parts.alias}</>;
    }
    return <>{parts.type}<br />{parts.lang}</>;
  }, []);

  return {
    handleAnnotationClick,
    renderAnnotationItem,
    renderLaneLabel,
  };
}