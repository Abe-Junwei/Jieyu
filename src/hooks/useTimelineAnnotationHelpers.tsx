import { useCallback } from 'react';
import { TimelineAnnotationItem, type TimelineAnnotationItemProps } from '../components/TimelineAnnotationItem';
import type { TranslationLayerDocType, UtteranceDocType } from '../db';
import { formatTime, getLayerLabelParts } from '../utils/transcriptionFormatters';

type TimelineUtterance = Pick<UtteranceDocType, 'id' | 'startTime' | 'endTime' | 'speaker' | 'speakerId'>;

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

type UseTimelineAnnotationHelpersParams = {
  manualSelectTsRef: React.MutableRefObject<number>;
  player: {
    isPlaying: boolean;
    stop: () => void;
    seekTo: (time: number) => void;
  };
  selectedUtteranceId: string;
  selectUtteranceRange: (startId: string, endId: string) => void;
  toggleUtteranceSelection: (id: string) => void;
  selectUtterance: (id: string) => void;
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
};

export function useTimelineAnnotationHelpers({
  manualSelectTsRef,
  player,
  selectedUtteranceId,
  selectUtteranceRange,
  toggleUtteranceSelection,
  selectUtterance,
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
}: UseTimelineAnnotationHelpersParams) {
  const handleAnnotationClick = useCallback((
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
  ) => {
    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) player.stop();
    if (e.shiftKey && selectedUtteranceId) {
      selectUtteranceRange(selectedUtteranceId, uttId);
    } else if (e.metaKey || e.ctrlKey) {
      toggleUtteranceSelection(uttId);
    } else {
      selectUtterance(uttId);
      player.seekTo(uttStartTime);
    }
    setSelectedLayerId(layerId);
    onFocusLayerRow(layerId);
  }, [
    manualSelectTsRef,
    player,
    selectUtteranceRange,
    selectedUtteranceId,
    toggleUtteranceSelection,
    selectUtterance,
    setSelectedLayerId,
    onFocusLayerRow,
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
    selectUtterance(uttId);
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
    selectUtterance,
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
    layer: TranslationLayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>,
  ) => {
    const dpStart = dragPreview?.id === utt.id ? dragPreview.start : utt.startTime;
    const dpEnd = dragPreview?.id === utt.id ? dragPreview.end : utt.endTime;
    const speakerVisual = speakerVisualByUtteranceId[utt.id];
    return (
      <TimelineAnnotationItem
        key={utt.id}
        left={dpStart * zoomPxPerSec}
        width={Math.max(4, (dpEnd - dpStart) * zoomPxPerSec)}
        isSelected={selectedUtteranceIds.has(utt.id)}
        isActive={utt.id === selectedUtteranceId && layer.id === focusedLayerRowId}
        isCompact={(dpEnd - dpStart) * zoomPxPerSec < 36}
        title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}${speakerVisual ? ` | 说话人：${speakerVisual.name}` : ''}`}
        draft={draft}
        speakerLabel={speakerVisual?.name ?? ''}
        speakerColor={speakerVisual?.color ?? '#2563eb'}
        onClick={(e) => handleAnnotationClick(utt.id, utt.startTime, layer.id, e)}
        onContextMenu={(e) => handleAnnotationContextMenu(utt.id, utt, layer.id, e)}
        onDoubleClick={() => zoomToUtterance(utt.startTime, utt.endTime)}
        onResizeStartPointerDown={(e) => startTimelineResizeDrag(e, utt, 'start', layer.id)}
        onResizeEndPointerDown={(e) => startTimelineResizeDrag(e, utt, 'end', layer.id)}
        onKeyDown={handleAnnotationKeyDown}
        noteCount={noteCounts.get(`${utt.id}::${layer.id}`) ?? 0}
        onNoteClick={(e) => handleNoteClick(utt.id, layer.id, e)}
        {...extra}
      />
    );
  }, [
    dragPreview,
    zoomPxPerSec,
    selectedUtteranceIds,
    selectedUtteranceId,
    focusedLayerRowId,
    handleAnnotationClick,
    handleAnnotationContextMenu,
    zoomToUtterance,
    startTimelineResizeDrag,
    handleAnnotationKeyDown,
    noteCounts,
    handleNoteClick,
    speakerVisualByUtteranceId,
  ]);

  const renderLaneLabel = useCallback((layer: TranslationLayerDocType) => {
    const parts = getLayerLabelParts(layer);
    return <>{parts.type}<br />{parts.lang}</>;
  }, []);

  return {
    handleAnnotationClick,
    renderAnnotationItem,
    renderLaneLabel,
  };
}