import {
  Fragment,
  startTransition,
  useCallback,
  useMemo,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { TimelineResizeDragOptions } from './useTimelineResize';
import {
  TimelineAnnotationItem,
  type TimelineAnnotationItemProps,
} from '../../components/TimelineAnnotationItem';
import type { LayerDocType, OrthographyDocType } from '../../db';
import type { ContextMenuState } from '../../pages/TranscriptionPage.UIState';
import { t, useLocale } from '../../i18n';
import { type TimelineUnit } from './transcriptionTypes';
import type { TimelineUnitView } from './timelineUnitView';
import {
  formatTime,
  getLayerHeaderLanguageLine,
  getOrthographyHeaderLine,
  getLayerHeaderVarietyOrAliasLine,
} from '../../utils/transcriptionFormatters';
import {
  layerDisplaySettingsToStyle,
  resolveOrthographyRenderPolicy,
} from '../../utils/layerDisplayStyle';
import {
  resolveTranscriptionSelectionAnchor,
  resolveTranscriptionUnitTarget,
} from '../../pages/transcriptionUnitTargetResolver';
import { type UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import {
  writeTimelineSelection,
  type TimelineSelectionCommand,
  type TimelineSelectionWriteInput,
} from '../../utils/applyTimelineSelectionCommand';

/** Rows bound into timeline annotation chrome. */
type TimelineAnnotationBoundDoc = TimelineUnitView;

type SpeakerVisual = {
  name: string;
  color: string;
};

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
  currentTimelineUnitId?: string;
  selectUnitRange: (startId: string, endId: string) => void;
  toggleUnitSelection: (id: string) => void;
  selectTimelineUnit?: (unit: TimelineUnit | null) => void;
  selectUnit: (id: string) => void;
  selectSegment: (id: string) => void;
  toggleSegmentSelection?: (segmentId: string) => void;
  selectSegmentRange?: (
    anchorId: string,
    targetId: string,
    items: ReadonlyArray<{ id: string; startTime?: number; endTime?: number }>,
  ) => void;
  clearUnitSelection?: () => void;
  waveformTimelineItems?: ReadonlyArray<{ id: string; startTime: number; endTime: number }>;
  /** ReadyWorkspace：横向轨面选集写路径优先经 applyTimelineSelectionCommand。 */
  applyTimelineSelectionCommand?: (command: TimelineSelectionCommand) => void;
  setSelectedLayerId: (id: string) => void;
  onFocusLayerRow: (id: string) => void;
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
  zoomPxPerSec: number;
  setCtxMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>;
  /** 用于写入 ctxMenu.layerType | Resolve ctxMenu.layerType */
  timelineTextLayers: ReadonlyArray<Pick<LayerDocType, 'id' | 'layerType'>>;
  navigateUnitFromInput: (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    direction: -1 | 1,
  ) => void;
  waveformAreaRef: React.RefObject<HTMLDivElement | null>;
  dragPreview: TimelineDragPreview;
  selectedUnitIds: Set<string>;
  focusedLayerRowId: string;
  zoomToUnit: (start: number, end: number) => void;
  startTimelineResizeDrag: (
    event: React.PointerEvent<HTMLElement>,
    row: TimelineAnnotationBoundDoc,
    edge: 'start' | 'end' | 'body',
    layerId: string,
    options?: TimelineResizeDragOptions,
  ) => void;
  handleNoteClick: (unitId: string, layerId: string | undefined, event: React.MouseEvent) => void;
  resolveNoteIndicatorTarget: (
    unitId: string,
    layerId?: string,
  ) => { count: number; layerId?: string } | null;
  speakerVisualByUnitId?: Record<string, SpeakerVisual>;
  onOverlapCycleToast?: (index: number, total: number, unitId: string) => void;
  independentLayerIds?: Set<string>;
  orthographies?: OrthographyDocType[];
  /** 备注标签同风格的按单元解析器：预先算好 layer + unit -> selfCertainty，再交给渲染层直接读取 */
  /** Note-badge style per-unit resolver: precompute layer + unit -> selfCertainty and let the renderer read it directly. */
  resolveSelfCertaintyForUnit?: (unitId: string, layerId?: string) => UnitSelfCertainty | undefined;
  resolveSelfCertaintyAmbiguityForUnit?: (unitId: string, layerId?: string) => boolean;
};

export function useTimelineAnnotationHelpers({
  manualSelectTsRef,
  player,
  selectedTimelineUnit,
  currentTimelineUnitId,
  selectUnitRange,
  toggleUnitSelection,
  selectTimelineUnit,
  selectUnit,
  selectSegment,
  toggleSegmentSelection,
  selectSegmentRange,
  clearUnitSelection,
  waveformTimelineItems = [],
  applyTimelineSelectionCommand,
  setSelectedLayerId,
  onFocusLayerRow,
  tierContainerRef,
  zoomPxPerSec,
  setCtxMenu,
  timelineTextLayers,
  navigateUnitFromInput,
  waveformAreaRef,
  dragPreview,
  selectedUnitIds,
  focusedLayerRowId,
  zoomToUnit,
  startTimelineResizeDrag,
  handleNoteClick,
  resolveNoteIndicatorTarget,
  speakerVisualByUnitId = {},
  onOverlapCycleToast,
  independentLayerIds = new Set<string>(),
  orthographies = [],
  resolveSelfCertaintyForUnit,
  resolveSelfCertaintyAmbiguityForUnit,
}: UseTimelineAnnotationHelpersParams) {
  const locale = useLocale();

  const selectionWriteDeps = useMemo(
    (): TimelineSelectionWriteInput => ({
      ...(applyTimelineSelectionCommand !== undefined ? { applyTimelineSelectionCommand } : {}),
      selectTimelineUnit: selectTimelineUnit ?? (() => undefined),
      selectUnit,
      selectUnitRange,
      toggleUnitSelection,
      toggleSegmentSelection: toggleSegmentSelection ?? (() => undefined),
      selectSegmentRange:
        selectSegmentRange ??
        ((_anchorId: string, _targetId: string, _items: ReadonlyArray<{ id: string }>) =>
          undefined),
      clearUnitSelection: clearUnitSelection ?? (() => undefined),
    }),
    [
      applyTimelineSelectionCommand,
      selectTimelineUnit,
      selectUnit,
      selectUnitRange,
      toggleUnitSelection,
      toggleSegmentSelection,
      selectSegmentRange,
      clearUnitSelection,
    ],
  );

  const selectTimelineUnitOrLegacy = useCallback(
    (unit: TimelineUnit) => {
      if (applyTimelineSelectionCommand || selectTimelineUnit) {
        writeTimelineSelection({ type: 'selectTimelineUnit', unit }, selectionWriteDeps);
        return;
      }
      if (unit.kind === 'segment') {
        selectSegment(unit.unitId);
      } else {
        selectUnit(unit.unitId);
      }
    },
    [
      applyTimelineSelectionCommand,
      selectSegment,
      selectTimelineUnit,
      selectUnit,
      selectionWriteDeps,
    ],
  );

  const handleAnnotationClick = useCallback(
    (
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
          preferredKind: 'unit',
          independentLayerIds,
        });
        if (targetUnit.kind === 'segment') {
          const segmentAnchor = resolveTranscriptionSelectionAnchor({
            expectedKind: 'segment',
            fallbackUnitId: uttId,
            selectedTimelineUnit,
          });
          if (e.shiftKey && segmentAnchor) {
            writeTimelineSelection(
              {
                type: 'selectSegmentRange',
                anchorId: segmentAnchor,
                targetId: uttId,
                waveformTimelineItems,
              },
              selectionWriteDeps,
            );
          } else if (e.metaKey || e.ctrlKey) {
            writeTimelineSelection(
              { type: 'toggleSegmentSelection', segmentId: uttId },
              selectionWriteDeps,
            );
          } else {
            selectTimelineUnitOrLegacy(targetUnit);
          }
          player.seekTo(uttStartTime);
          setSelectedLayerId(layerId);
          onFocusLayerRow(layerId);
          return;
        }
        const selectedUnitUnitId = resolveTranscriptionSelectionAnchor({
          expectedKind: 'unit',
          fallbackUnitId: '',
          selectedTimelineUnit,
        });
        if (e.shiftKey && selectedUnitUnitId) {
          writeTimelineSelection(
            { type: 'selectUnitRange', startId: selectedUnitUnitId, endId: uttId },
            selectionWriteDeps,
          );
        } else if (e.metaKey || e.ctrlKey) {
          writeTimelineSelection(
            { type: 'toggleUnitSelection', unitId: uttId },
            selectionWriteDeps,
          );
        } else if (
          selectedUnitUnitId === uttId &&
          overlapCycleItems &&
          overlapCycleItems.length > 1
        ) {
          const index = overlapCycleItems.findIndex((item) => item.id === uttId);
          const next = overlapCycleItems[(index + 1) % overlapCycleItems.length];
          if (next) {
            writeTimelineSelection({ type: 'selectUnit', unitId: next.id }, selectionWriteDeps);
            player.seekTo(next.startTime);
            onOverlapCycleToast?.(
              Math.max(1, ((index + 1) % overlapCycleItems.length) + 1),
              overlapCycleItems.length,
              next.id,
            );
          }
        } else {
          selectTimelineUnitOrLegacy(targetUnit);
          player.seekTo(uttStartTime);
        }
        setSelectedLayerId(layerId);
        onFocusLayerRow(layerId);
      });
    },
    [
      independentLayerIds,
      manualSelectTsRef,
      player,
      selectionWriteDeps,
      selectedTimelineUnit,
      selectTimelineUnitOrLegacy,
      setSelectedLayerId,
      onFocusLayerRow,
      onOverlapCycleToast,
      waveformTimelineItems,
    ],
  );

  const handleAnnotationContextMenu = useCallback(
    (uttId: string, utt: TimelineAnnotationBoundDoc, layerId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      manualSelectTsRef.current = Date.now();
      if (player.isPlaying) player.stop();
      const targetUnit = resolveTranscriptionUnitTarget({
        layerId,
        unitId: uttId,
        preferredKind: 'unit',
        independentLayerIds,
      });
      const shouldPreserveMultiSelection = selectedUnitIds.has(uttId) && selectedUnitIds.size > 1;
      if (!shouldPreserveMultiSelection) {
        selectTimelineUnitOrLegacy(targetUnit);
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
      const row = timelineTextLayers.find((layer) => layer.id === targetUnit.layerId);
      const layerType = row?.layerType === 'translation' ? 'translation' : 'transcription';
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        unitId: uttId,
        layerId: targetUnit.layerId,
        unitKind: targetUnit.kind,
        splitTime,
        source: 'timeline',
        menuSurface: 'timeline-annotation',
        layerType,
      });
    },
    [
      independentLayerIds,
      manualSelectTsRef,
      player,
      selectedUnitIds,
      selectTimelineUnitOrLegacy,
      setSelectedLayerId,
      onFocusLayerRow,
      tierContainerRef,
      zoomPxPerSec,
      setCtxMenu,
      timelineTextLayers,
    ],
  );

  const handleAnnotationKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    },
    [navigateUnitFromInput, waveformAreaRef],
  );

  const renderAnnotationItem = useCallback(
    (
      utt: TimelineAnnotationBoundDoc,
      layer: LayerDocType,
      draft: string,
      extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'> &
        Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>> & {
          showSpeaker?: boolean;
          overlapCycleItems?: OverlapCycleItem[];
          overlapCycleStatus?: { index: number; total: number };
          content?: ReactNode;
          tools?: ReactNode;
          hasTrailingTools?: boolean;
          saveStatus?: 'dirty' | 'saving' | 'error';
          onRetrySave?: () => void;
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
      const speakerVisual = showSpeaker ? speakerVisualByUnitId[utt.id] : undefined;
      const noteIndicator = resolveNoteIndicatorTarget(utt.id, layer.id);
      const renderPolicy = resolveOrthographyRenderPolicy(
        layer.languageId,
        orthographies,
        layer.orthographyId,
      );
      // self-certainty 必须按当前显示 lane 解析，不能沿用借来的 source row layerId。
      // Resolve self-certainty by the visible lane identity, not the borrowed source row layer id.
      const certaintyLookupLayerId = layer.id;
      const uttSelfCertainty = resolveSelfCertaintyForUnit?.(utt.id, certaintyLookupLayerId);
      const selfCertaintyAmbiguous =
        !uttSelfCertainty &&
        resolveSelfCertaintyAmbiguityForUnit?.(utt.id, certaintyLookupLayerId) === true;
      const tierLabel =
        uttSelfCertainty === 'certain'
          ? t(locale, 'transcription.unit.selfCertainty.certain')
          : uttSelfCertainty === 'uncertain'
            ? t(locale, 'transcription.unit.selfCertainty.uncertain')
            : uttSelfCertainty === 'not_understood'
              ? t(locale, 'transcription.unit.selfCertainty.notUnderstood')
              : '';
      const selfCertaintyTitle =
        uttSelfCertainty && tierLabel
          ? `${tierLabel}\n${t(locale, 'transcription.unit.selfCertainty.dimensionHint')}`
          : undefined;
      if (utt.tags?.skipProcessing === true) return null;
      const currentUnitId = selectedTimelineUnit?.unitId ?? currentTimelineUnitId;
      return (
        <TimelineAnnotationItem
          key={utt.id}
          left={dpStart * zoomPxPerSec}
          width={Math.max(4, (dpEnd - dpStart) * zoomPxPerSec)}
          isSelected={selectedUnitIds.has(utt.id)}
          isLayerCurrent={layer.id === focusedLayerRowId && currentUnitId === utt.id}
          isActive={
            layer.id === focusedLayerRowId &&
            selectedTimelineUnit?.layerId === layer.id &&
            selectedTimelineUnit.unitId === utt.id
          }
          isCompact={(dpEnd - dpStart) * zoomPxPerSec < 36}
          title={`${formatTime(utt.startTime)} – ${formatTime(utt.endTime)}${speakerVisual ? ` | 说话人：${speakerVisual.name}` : ''}`}
          draft={draft}
          speakerLabel={speakerVisual?.name ?? ''}
          speakerColor={speakerVisual?.color ?? 'var(--state-info-solid)'}
          {...(overlapCycleStatus ? { overlapCycleIndicator: overlapCycleStatus } : {})}
          {...('ai_metadata' in utt && utt.ai_metadata?.confidence != null
            ? { confidence: utt.ai_metadata.confidence }
            : {})}
          {...(uttSelfCertainty && selfCertaintyTitle
            ? { selfCertainty: uttSelfCertainty, selfCertaintyTitle }
            : {})}
          {...(selfCertaintyAmbiguous ? { selfCertaintyAmbiguous } : {})}
          {...(content ? { content } : {})}
          {...(tools ? { tools } : {})}
          {...(hasTrailingTools ? { hasTrailingTools } : {})}
          onClick={(e) =>
            handleAnnotationClick(utt.id, utt.startTime, layer.id, e, overlapCycleItems)
          }
          onContextMenu={(e) => handleAnnotationContextMenu(utt.id, utt, layer.id, e)}
          onDoubleClick={() => zoomToUnit(utt.startTime, utt.endTime)}
          onResizeStartPointerDown={(e) => startTimelineResizeDrag(e, utt, 'start', layer.id)}
          onResizeEndPointerDown={(e) => startTimelineResizeDrag(e, utt, 'end', layer.id)}
          onBodyMovePointerDown={(e) => startTimelineResizeDrag(e, utt, 'body', layer.id)}
          onKeyDown={handleAnnotationKeyDown}
          noteCount={noteIndicator?.count ?? 0}
          {...(noteIndicator
            ? { onNoteClick: (e: MouseEvent) => handleNoteClick(utt.id, noteIndicator.layerId, e) }
            : {})}
          layerStyle={layerDisplaySettingsToStyle(layer.displaySettings, renderPolicy)}
          {...(renderPolicy.preferDirAttribute
            ? { contentDirection: renderPolicy.textDirection }
            : {})}
          {...itemExtra}
        />
      );
    },
    [
      dragPreview,
      zoomPxPerSec,
      selectedUnitIds,
      selectedTimelineUnit,
      currentTimelineUnitId,
      focusedLayerRowId,
      handleAnnotationClick,
      handleAnnotationContextMenu,
      zoomToUnit,
      startTimelineResizeDrag,
      handleAnnotationKeyDown,
      handleNoteClick,
      orthographies,
      locale,
      resolveNoteIndicatorTarget,
      speakerVisualByUnitId,
      resolveSelfCertaintyAmbiguityForUnit,
      resolveSelfCertaintyForUnit,
    ],
  );

  const renderLaneLabel = useCallback(
    (layer: LayerDocType) => {
      const languageLine = getLayerHeaderLanguageLine(layer, locale);
      const varietyOrAliasLine = getLayerHeaderVarietyOrAliasLine(layer);
      const targetOrthography = layer.orthographyId
        ? orthographies.find((orthography) => orthography.id === layer.orthographyId)
        : undefined;
      const orthographyLine = getOrthographyHeaderLine(targetOrthography, locale);
      const labelLines = [languageLine, varietyOrAliasLine, orthographyLine].filter(
        (line) => line.trim().length > 0,
      );
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
    },
    [locale, orthographies],
  );

  return {
    handleAnnotationClick,
    handleAnnotationContextMenu,
    renderAnnotationItem,
    renderLaneLabel,
  };
}
