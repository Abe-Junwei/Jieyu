import { Fragment, startTransition, useCallback, useMemo, type MouseEvent, type ReactNode } from 'react';
import { TimelineAnnotationItem, type TimelineAnnotationItemProps } from '../components/TimelineAnnotationItem';
import type { LayerDocType, OrthographyDocType, UtteranceDocType } from '../db';
import { t, useLocale } from '../i18n';
import { type TimelineUnit, type TimelineUnitKind } from './transcriptionTypes';
import type { TimelineUnitView } from './timelineUnitView';
import {
  formatTime,
  getLayerHeaderLanguageLine,
  getOrthographyHeaderLine,
  getLayerHeaderVarietyOrAliasLine,
} from '../utils/transcriptionFormatters';
import { layerDisplaySettingsToStyle, resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import {
  resolveTranscriptionSelectionAnchor,
  resolveTranscriptionUnitTarget,
} from '../pages/transcriptionUnitTargetResolver';
import {
  resolveTimelineRowSelfCertainty,
  type UtteranceSelfCertainty,
} from '../utils/utteranceSelfCertainty';

/** Rows bound into timeline annotation chrome. */
type TimelineAnnotationBoundDoc = TimelineUnitView;

type SpeakerVisual = {
  name: string;
  color: string;
};

type CtxMenuState = {
  x: number;
  y: number;
  unitId: string;
  layerId: string;
  unitKind: TimelineUnitKind;
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
  selectUnitRange: (startId: string, endId: string) => void;
  toggleUnitSelection: (id: string) => void;
  selectTimelineUnit?: (unit: TimelineUnit | null) => void;
  selectUnit: (id: string) => void;
  selectSegment: (id: string) => void;
  setSelectedLayerId: (id: string) => void;
  onFocusLayerRow: (id: string) => void;
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
  zoomPxPerSec: number;
  setCtxMenu: React.Dispatch<React.SetStateAction<CtxMenuState>>;
  navigateUnitFromInput: (e: React.KeyboardEvent<HTMLInputElement>, direction: -1 | 1) => void;
  waveformAreaRef: React.RefObject<HTMLDivElement | null>;
  dragPreview: TimelineDragPreview;
  selectedUnitIds: Set<string>;
  focusedLayerRowId: string;
  zoomToUtterance: (start: number, end: number) => void;
  startTimelineResizeDrag: (
    event: React.PointerEvent<HTMLElement>,
    row: TimelineAnnotationBoundDoc,
    edge: 'start' | 'end',
    layerId: string,
  ) => void;
  handleNoteClick: (utteranceId: string, layerId: string | undefined, event: React.MouseEvent) => void;
  resolveNoteIndicatorTarget: (unitId: string, layerId?: string) => { count: number; layerId?: string } | null;
  speakerVisualByUtteranceId?: Record<string, SpeakerVisual>;
  onOverlapCycleToast?: (index: number, total: number, utteranceId: string) => void;
  independentLayerIds?: Set<string>;
  orthographies?: OrthographyDocType[];
  /** 当前媒体 utterance 列表：segment 行角标从宿主 utterance 读取 selfCertainty */
  utterancesForSelfCertainty?: ReadonlyArray<UtteranceDocType>;
};

export function useTimelineAnnotationHelpers({
  manualSelectTsRef,
  player,
  selectedTimelineUnit,
  selectUnitRange,
  toggleUnitSelection,
  selectTimelineUnit,
  selectUnit,
  selectSegment,
  setSelectedLayerId,
  onFocusLayerRow,
  tierContainerRef,
  zoomPxPerSec,
  setCtxMenu,
  navigateUnitFromInput,
  waveformAreaRef,
  dragPreview,
  selectedUnitIds,
  focusedLayerRowId,
  zoomToUtterance,
  startTimelineResizeDrag,
  handleNoteClick,
  resolveNoteIndicatorTarget,
  speakerVisualByUtteranceId = {},
  onOverlapCycleToast,
  independentLayerIds = new Set<string>(),
  orthographies = [],
  utterancesForSelfCertainty,
}: UseTimelineAnnotationHelpersParams) {
  const locale = useLocale();

  const selfCertaintyByUtteranceId = useMemo(() => {
    const m = new Map<string, UtteranceSelfCertainty>();
    for (const u of utterancesForSelfCertainty ?? []) {
      if (u.selfCertainty) m.set(u.id, u.selfCertainty);
    }
    return m;
  }, [utterancesForSelfCertainty]);

  const handleAnnotationClick = useCallback((
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: OverlapCycleItem[],
  ) => {
    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) player.stop();
    // 选段级联渲染降为低优先级；WaveSurfer 已即时处理视觉高亮 | Defer selection cascade render; WaveSurfer already handles visual highlight
    startTransition(() => {
      const targetUnit = resolveTranscriptionUnitTarget({
        layerId,
        unitId: uttId,
        preferredKind: 'utterance',
        independentLayerIds,
      });
      if (targetUnit.kind === 'segment') {
        if (selectTimelineUnit) {
          selectTimelineUnit(targetUnit);
        } else {
          selectSegment(uttId);
        }
        player.seekTo(uttStartTime);
        setSelectedLayerId(layerId);
        onFocusLayerRow(layerId);
        return;
      }
      const selectedUtteranceUnitId = resolveTranscriptionSelectionAnchor({
        expectedKind: 'utterance',
        fallbackUnitId: '',
        selectedTimelineUnit,
      });
      if (e.shiftKey && selectedUtteranceUnitId) {
        selectUnitRange(selectedUtteranceUnitId, uttId);
      } else if (e.metaKey || e.ctrlKey) {
        toggleUnitSelection(uttId);
      } else if (
        selectedUtteranceUnitId === uttId
        && overlapCycleItems
        && overlapCycleItems.length > 1
      ) {
        const index = overlapCycleItems.findIndex((item) => item.id === uttId);
        const next = overlapCycleItems[(index + 1) % overlapCycleItems.length];
        if (next) {
          selectUnit(next.id);
          player.seekTo(next.startTime);
          onOverlapCycleToast?.(
            Math.max(1, ((index + 1) % overlapCycleItems.length) + 1),
            overlapCycleItems.length,
            next.id,
          );
        }
      } else {
        if (selectTimelineUnit) {
          selectTimelineUnit(targetUnit);
        } else {
          selectUnit(uttId);
        }
        player.seekTo(uttStartTime);
      }
      setSelectedLayerId(layerId);
      onFocusLayerRow(layerId);
    });
  }, [
    manualSelectTsRef,
    player,
    selectUnitRange,
    selectedTimelineUnit,
    toggleUnitSelection,
    selectUnit,
    selectTimelineUnit,
    selectSegment,
    setSelectedLayerId,
    onFocusLayerRow,
    onOverlapCycleToast,
  ]);

  const handleAnnotationContextMenu = useCallback((
    uttId: string,
    utt: TimelineAnnotationBoundDoc,
    layerId: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    manualSelectTsRef.current = Date.now();
    if (player.isPlaying) player.stop();
    const targetUnit = resolveTranscriptionUnitTarget({
      layerId,
      unitId: uttId,
      preferredKind: 'utterance',
      independentLayerIds,
    });
    const shouldPreserveMultiSelection = selectedUnitIds.has(uttId) && selectedUnitIds.size > 1;
    if (!shouldPreserveMultiSelection) {
      if (targetUnit.kind === 'segment') {
        if (selectTimelineUnit) {
          selectTimelineUnit(targetUnit);
        } else {
          selectSegment(uttId);
        }
      } else {
        if (selectTimelineUnit) {
          selectTimelineUnit(targetUnit);
        } else {
          selectUnit(uttId);
        }
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
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      unitId: uttId,
      layerId: targetUnit.layerId,
      unitKind: targetUnit.kind,
      splitTime,
    });
  }, [
    manualSelectTsRef,
    player,
    selectedUnitIds,
    selectTimelineUnit,
    selectUnit,
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
      navigateUnitFromInput(e, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Enter') {
      navigateUnitFromInput(e, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      waveformAreaRef.current?.focus();
    }
  }, [navigateUnitFromInput, waveformAreaRef]);

  const renderAnnotationItem = useCallback((
    utt: TimelineAnnotationBoundDoc,
    layer: LayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>
      & {
        showSpeaker?: boolean;
        overlapCycleItems?: OverlapCycleItem[];
        overlapCycleStatus?: { index: number; total: number };
        content?: ReactNode;
        tools?: ReactNode;
        hasTrailingTools?: boolean;
      },
  ) => {
    const {
      showSpeaker = true,
      overlapCycleItems,
      overlapCycleStatus,
      content,
      tools,
      hasTrailingTools,
      ...itemExtra
    } = extra;
    const dpStart = dragPreview?.id === utt.id ? dragPreview.start : utt.startTime;
    const dpEnd = dragPreview?.id === utt.id ? dragPreview.end : utt.endTime;
    const speakerVisual = showSpeaker ? speakerVisualByUtteranceId[utt.id] : undefined;
    const noteIndicator = resolveNoteIndicatorTarget(utt.id, layer.id);
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
    const explicitParentUtteranceId = utt.parentUtteranceId;
    const isSegmentRow = utt.kind === 'segment';
    const { selfCertainty: uttSelfCertainty } = resolveTimelineRowSelfCertainty({
      unitId: utt.id,
      startTime: utt.startTime,
      endTime: utt.endTime,
      isSegmentRow,
      ...(explicitParentUtteranceId ? { parentUtteranceId: explicitParentUtteranceId } : {}),
      ...((utt.mediaId?.trim() ?? '').length > 0 ? { mediaId: utt.mediaId } : {}),
      utterances: utterancesForSelfCertainty ?? [],
      selfCertaintyByUtteranceId,
    });
    const tierLabel = uttSelfCertainty === 'certain'
      ? t(locale, 'transcription.utterance.selfCertainty.certain')
      : uttSelfCertainty === 'uncertain'
        ? t(locale, 'transcription.utterance.selfCertainty.uncertain')
        : uttSelfCertainty === 'not_understood'
          ? t(locale, 'transcription.utterance.selfCertainty.not_understood')
          : '';
    const selfCertaintyTitle = uttSelfCertainty && tierLabel
      ? `${tierLabel}\n${t(locale, 'transcription.utterance.selfCertainty.dimensionHint')}`
      : undefined;
    return (
      <TimelineAnnotationItem
        key={utt.id}
        left={dpStart * zoomPxPerSec}
        width={Math.max(4, (dpEnd - dpStart) * zoomPxPerSec)}
        isSelected={selectedUnitIds.has(utt.id)}
        isActive={
          layer.id === focusedLayerRowId
            && selectedTimelineUnit?.layerId === layer.id
            && selectedTimelineUnit.unitId === utt.id
        }
        isCompact={(dpEnd - dpStart) * zoomPxPerSec < 36}
        title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}${speakerVisual ? ` | 说话人：${speakerVisual.name}` : ''}`}
        draft={draft}
        speakerLabel={speakerVisual?.name ?? ''}
        speakerColor={speakerVisual?.color ?? 'var(--state-info-solid)'}
        {...(overlapCycleStatus ? { overlapCycleIndicator: overlapCycleStatus } : {})}
        {...('ai_metadata' in utt && utt.ai_metadata?.confidence != null ? { confidence: utt.ai_metadata.confidence } : {})}
        {...(uttSelfCertainty && selfCertaintyTitle
          ? { selfCertainty: uttSelfCertainty, selfCertaintyTitle }
          : {})}
        {...(content ? { content } : {})}
        {...(tools ? { tools } : {})}
        {...(hasTrailingTools ? { hasTrailingTools } : {})}
        onClick={(e) => handleAnnotationClick(utt.id, utt.startTime, layer.id, e, overlapCycleItems)}
        onContextMenu={(e) => handleAnnotationContextMenu(utt.id, utt, layer.id, e)}
        onDoubleClick={() => zoomToUtterance(utt.startTime, utt.endTime)}
        onResizeStartPointerDown={(e) => startTimelineResizeDrag(e, utt, 'start', layer.id)}
        onResizeEndPointerDown={(e) => startTimelineResizeDrag(e, utt, 'end', layer.id)}
        onKeyDown={handleAnnotationKeyDown}
        noteCount={noteIndicator?.count ?? 0}
        {...(noteIndicator ? { onNoteClick: (e: MouseEvent) => handleNoteClick(utt.id, noteIndicator.layerId, e) } : {})}
        layerStyle={layerDisplaySettingsToStyle(layer.displaySettings, renderPolicy)}
        {...(renderPolicy.preferDirAttribute ? { contentDirection: renderPolicy.textDirection } : {})}
        {...itemExtra}
      />
    );
  }, [
    dragPreview,
    zoomPxPerSec,
    selectedUnitIds,
    selectedTimelineUnit,
    focusedLayerRowId,
    independentLayerIds,
    handleAnnotationClick,
    handleAnnotationContextMenu,
    zoomToUtterance,
    startTimelineResizeDrag,
    handleAnnotationKeyDown,
    handleNoteClick,
    orthographies,
    locale,
    resolveNoteIndicatorTarget,
    speakerVisualByUtteranceId,
    selfCertaintyByUtteranceId,
    utterancesForSelfCertainty,
  ]);

  const renderLaneLabel = useCallback((layer: LayerDocType) => {
    const languageLine = getLayerHeaderLanguageLine(layer, locale);
    const varietyOrAliasLine = getLayerHeaderVarietyOrAliasLine(layer);
    const targetOrthography = layer.orthographyId
      ? orthographies.find((orthography) => orthography.id === layer.orthographyId)
      : undefined;
    const orthographyLine = getOrthographyHeaderLine(targetOrthography, locale);
    const labelLines = [languageLine, varietyOrAliasLine, orthographyLine].filter((line) => line.trim().length > 0);
    return (
      <>
        {labelLines.map((line, index) => (
          <Fragment key={`${layer.id}-label-line-${index}`}>
            {index > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </>
    );
  }, [locale, orthographies]);

  return {
    handleAnnotationClick,
    handleAnnotationContextMenu,
    renderAnnotationItem,
    renderLaneLabel,
  };
}