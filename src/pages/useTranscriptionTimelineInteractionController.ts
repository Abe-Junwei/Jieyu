import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { SnapGuide } from '../hooks/useTranscriptionData';
import { handleTranscriptionCitationJump } from './TranscriptionPage.citationJump';
import { snapToZeroCrossing } from '../services/AudioAnalysisService';
import { fireAndForget } from '../utils/fireAndForget';
import { t } from '../i18n';
import {
  resolveTranscriptionSelectionAnchor,
  resolveTranscriptionUnitTarget,
} from './transcriptionUnitTargetResolver';

type ContextMenuUnitKind = 'segment' | 'utterance';

interface WaveformTimelineItemLike {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string;
}

interface WaveSurferInstanceLike {
  getCurrentTime: () => number;
  getWrapper: () => HTMLElement;
  getDuration: () => number;
  getDecodedData?: () => AudioBuffer | null;
}

interface PlayerLike {
  isPlaying: boolean;
  stop: () => void;
  seekTo: (timeSeconds: number) => void;
  instanceRef: MutableRefObject<WaveSurferInstanceLike | null>;
}

interface ContextMenuStateLike {
  x: number;
  y: number;
  unitId: string;
  layerId: string;
  unitKind: ContextMenuUnitKind;
  splitTime: number;
  source?: 'timeline' | 'waveform';
}

interface PdfPreviewOpenRequestInput {
  title: string;
  page: number | null;
  sourceUrl?: string;
  sourceBlob?: Blob;
  hashSuffix?: string;
  searchSnippet?: string;
}

interface SubSelectDragLike {
  active: boolean;
  regionId: string;
  anchorTime: number;
  pointerId: number;
}

interface UseTranscriptionTimelineInteractionControllerInput {
  layers: LayerDocType[];
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  utterances: UtteranceDocType[];
  selectUtterance: (utteranceId: string) => void;
  manualSelectTsRef: MutableRefObject<number>;
  player: PlayerLike;
  locale: string;
  sidePaneRows: LayerDocType[];
  selectedTimelineUtteranceId: string;
  onSetNotePopover: (state: { x: number; y: number; uttId: string; layerId?: string } | null) => void;
  onSetSidebarError: (value: string | null) => void;
  onRevealSchemaLayer: (layerId: string) => void;
  onOpenPdfPreviewRequest: (input: PdfPreviewOpenRequestInput) => void;
  waveformTimelineItems: WaveformTimelineItemLike[];
  runSplitAtTime: (id: string, timeSeconds: number) => void;
  activeLayerIdForEdits: string;
  useSegmentWaveformRegions: boolean;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  selectedTimelineUnit: TimelineUnit | null;
  toggleSegmentSelection: (segmentId: string) => void;
  selectSegmentRange: (anchorId: string, targetId: string, items: WaveformTimelineItemLike[]) => void;
  toggleUtteranceSelection: (utteranceId: string) => void;
  selectUtteranceRange: (anchorId: string, targetId: string) => void;
  setSubSelectionRange: (range: { start: number; end: number } | null) => void;
  subSelectDragRef: MutableRefObject<SubSelectDragLike | null>;
  waveCanvasRef: MutableRefObject<HTMLElement | null>;
  zoomToPercent: (percent: number, centerRatio?: number, mode?: 'fit-all' | 'fit-selection' | 'custom') => void;
  zoomToUtterance: (startTime: number, endTime: number) => void;
  resolveSegmentRoutingForLayer: (layerId?: string) => {
    segmentSourceLayer: LayerDocType | undefined;
    sourceLayerId: string;
    editMode: 'utterance' | 'independent-segment' | 'time-subdivision';
  };
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getNeighborBounds: (itemId: string, mediaId: string | undefined, probeStart: number) => { left: number; right: number | undefined };
  reloadSegments: () => Promise<void>;
  saveUtteranceTiming: (id: string, start: number, end: number) => Promise<void>;
  setSaveState: (state: { kind: 'done' | 'error'; message: string }) => void;
  selectedUtteranceIds: Set<string>;
  selectedWaveformRegionId: string | null;
  beginTimingGesture: (id: string) => void;
  endTimingGesture: (id: string) => void;
  makeSnapGuide: (bounds: { left: number; right: number | undefined }, start: number, end: number) => SnapGuide;
  snapEnabled: boolean;
  setSnapGuide: Dispatch<SetStateAction<SnapGuide>>;
  setDragPreview: Dispatch<SetStateAction<{ id: string; start: number; end: number } | null>>;
  creatingSegmentRef: MutableRefObject<boolean>;
  markingModeRef: MutableRefObject<boolean>;
  setCtxMenu: (state: ContextMenuStateLike | null) => void;
  createUtteranceFromSelection: (start: number, end: number) => Promise<void>;
}

interface UseTranscriptionTimelineInteractionControllerResult {
  handleSearchReplace: (utteranceId: string, layerId: string | undefined, oldText: string, newText: string) => void;
  handleJumpToEmbeddingMatch: (utteranceId: string) => void;
  handleJumpToCitation: (
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citationRef?: { snippet?: string },
  ) => Promise<void>;
  handleSplitAtTimeRequest: (timeSeconds: number) => boolean;
  handleZoomToSegmentRequest: (segmentId: string, zoomLevel?: number) => boolean;
  getNeighborBoundsRouted: (itemId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => { left: number; right: number | undefined };
  saveTimingRouted: (id: string, start: number, end: number, layerId?: string) => Promise<void>;
  handleWaveformRegionContextMenu: (regionId: string, x: number, y: number) => void;
  handleWaveformRegionAltPointerDown: (regionId: string, time: number, pointerId: number, clientX: number) => void;
  handleWaveformRegionClick: (regionId: string, clickTime: number, event: MouseEvent) => void;
  handleWaveformRegionDoubleClick: (regionId: string, start: number, end: number) => void;
  handleWaveformRegionCreate: (start: number, end: number) => void;
  handleWaveformRegionUpdate: (regionId: string, start: number, end: number) => void;
  handleWaveformRegionUpdateEnd: (regionId: string, start: number, end: number) => void;
  handleWaveformTimeUpdate: (time: number) => void;
}

export function useTranscriptionTimelineInteractionController(
  input: UseTranscriptionTimelineInteractionControllerInput,
): UseTranscriptionTimelineInteractionControllerResult {
  const uiLocale = input.locale as Parameters<typeof t>[0];
  const waveformLayerId = input.useSegmentWaveformRegions ? input.activeLayerIdForEdits : undefined;
  const resolveWaveformUnitTarget = (unitId: string) => resolveTranscriptionUnitTarget({
    layerId: input.activeLayerIdForEdits,
    unitId,
    preferredKind: input.useSegmentWaveformRegions ? 'segment' : 'utterance',
  });

  const handleSearchReplace = useCallback((utteranceId: string, layerId: string | undefined, _oldText: string, newText: string) => {
    if (layerId) {
      const targetLayer = input.layers.find((layer) => layer.id === layerId);
      if (targetLayer?.layerType === 'transcription') {
        void input.saveUtteranceText(utteranceId, newText, layerId);
        return;
      }
      void input.saveTextTranslationForUtterance(utteranceId, newText, layerId);
      return;
    }
    void input.saveUtteranceText(utteranceId, newText);
  }, [input.layers, input.saveTextTranslationForUtterance, input.saveUtteranceText]);

  const handleJumpToEmbeddingMatch = useCallback((utteranceId: string) => {
    if (!utteranceId) return;
    const target = input.utterances.find((item) => item.id === utteranceId);
    input.selectUtterance(utteranceId);
    if (!target) return;
    input.manualSelectTsRef.current = Date.now();
    input.player.seekTo(target.startTime);
  }, [input.manualSelectTsRef, input.player, input.selectUtterance, input.utterances]);

  const handleJumpToCitation = useCallback(async (
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citationRef?: { snippet?: string },
  ) => {
    await handleTranscriptionCitationJump({
      locale: input.locale,
      citationType,
      refId,
      ...(citationRef ? { citationRef } : {}),
      sidePaneRows: input.sidePaneRows,
      selectedTimelineUtteranceId: input.selectedTimelineUtteranceId,
      onJumpToEmbeddingMatch: handleJumpToEmbeddingMatch,
      onSetNotePopover: input.onSetNotePopover,
      onSetSidebarError: input.onSetSidebarError,
      onRevealSchemaLayer: input.onRevealSchemaLayer,
      onOpenPdfPreviewRequest: input.onOpenPdfPreviewRequest,
    });
  }, [handleJumpToEmbeddingMatch, input.sidePaneRows, input.locale, input.onOpenPdfPreviewRequest, input.onRevealSchemaLayer, input.onSetNotePopover, input.onSetSidebarError, input.selectedTimelineUtteranceId]);

  const handleSplitAtTimeRequest = useCallback((timeSeconds: number) => {
    const target = input.waveformTimelineItems.find((item) => item.startTime < timeSeconds && item.endTime > timeSeconds);
    if (!target) return false;
    input.runSplitAtTime(target.id, timeSeconds);
    return true;
  }, [input.runSplitAtTime, input.waveformTimelineItems]);

  const handleZoomToSegmentRequest = useCallback((segmentId: string, zoomLevel?: number) => {
    const target = input.waveformTimelineItems.find((item) => item.id === segmentId);
    if (!target) return false;
    const nextTarget = resolveWaveformUnitTarget(segmentId);
    input.manualSelectTsRef.current = Date.now();
    if (input.player.isPlaying) {
      input.player.stop();
    }
    input.selectTimelineUnit(nextTarget);
    input.player.seekTo(target.startTime);
    if (typeof zoomLevel === 'number' && Number.isFinite(zoomLevel)) {
      input.zoomToPercent(Math.max(100, Math.min(800, zoomLevel * 100)), 0.5, 'custom');
    } else {
      input.zoomToUtterance(target.startTime, target.endTime);
    }
    return true;
  }, [input.activeLayerIdForEdits, input.manualSelectTsRef, input.player, input.selectTimelineUnit, input.useSegmentWaveformRegions, input.waveformTimelineItems, input.zoomToPercent, input.zoomToUtterance]);

  const getNeighborBoundsRouted = useCallback((itemId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => {
    if (layerId) {
      const routing = input.resolveSegmentRoutingForLayer(layerId);
      if (routing.segmentSourceLayer) {
        const segments = input.segmentsByLayer.get(routing.sourceLayerId) ?? [];
        const siblings = segments
          .filter((segment) => segment.id !== itemId)
          .sort((left, right) => left.startTime - right.startTime);
        const timeline = [...siblings, { id: itemId, startTime: probeStart, endTime: probeStart + 0.1 }].sort(
          (left, right) => left.startTime - right.startTime,
        );
        const index = timeline.findIndex((segment) => segment.id === itemId);
        const prev = index > 0 ? timeline[index - 1] : undefined;
        const next = index >= 0 && index < timeline.length - 1 ? timeline[index + 1] : undefined;
        let left = prev ? prev.endTime + 0.02 : 0;
        let right: number | undefined = next ? next.startTime - 0.02 : undefined;
        if (routing.editMode === 'time-subdivision') {
          const parentUtterance = input.utterancesOnCurrentMedia.find(
            (utterance) => utterance.startTime <= probeStart + 0.01 && utterance.endTime >= probeStart - 0.01,
          );
          if (parentUtterance) {
            left = Math.max(left, parentUtterance.startTime);
            right = right !== undefined ? Math.min(right, parentUtterance.endTime) : parentUtterance.endTime;
          }
        }
        return { left, right };
      }
    }
    return input.getNeighborBounds(itemId, mediaId, probeStart);
  }, [input.getNeighborBounds, input.resolveSegmentRoutingForLayer, input.segmentsByLayer, input.utterancesOnCurrentMedia]);

  const saveTimingRouted = useCallback(async (id: string, start: number, end: number, layerId?: string) => {
    if (layerId) {
      const routing = input.resolveSegmentRoutingForLayer(layerId);
      if (routing.segmentSourceLayer) {
        let finalStart = start;
        let finalEnd = end;
        let subdivisionClampedInResize = false;
        if (routing.editMode === 'time-subdivision') {
          const parentUtterance = input.utterancesOnCurrentMedia.find(
            (utterance) => utterance.startTime <= finalStart + 0.01 && utterance.endTime >= finalEnd - 0.01,
          );
          if (parentUtterance) {
            const beforeClampStart = finalStart;
            const beforeClampEnd = finalEnd;
            finalStart = Math.max(finalStart, parentUtterance.startTime);
            finalEnd = Math.min(finalEnd, parentUtterance.endTime);
            subdivisionClampedInResize = Math.abs(finalStart - beforeClampStart) > 0.0005
              || Math.abs(finalEnd - beforeClampEnd) > 0.0005;
          }
        }
        await LayerSegmentationV2Service.updateSegment(id, {
          startTime: Number(finalStart.toFixed(3)),
          endTime: Number(finalEnd.toFixed(3)),
          updatedAt: new Date().toISOString(),
        });
        await input.reloadSegments();
        if (subdivisionClampedInResize) {
          input.setSaveState({ kind: 'done', message: t(uiLocale, 'transcription.timeline.timeSubdivisionClampAdjusted') });
        }
        return;
      }
    }
    await input.saveUtteranceTiming(id, start, end);
  }, [input.reloadSegments, input.resolveSegmentRoutingForLayer, input.saveUtteranceTiming, input.setSaveState, input.utterancesOnCurrentMedia]);

  const handleWaveformRegionContextMenu = useCallback((regionId: string, x: number, y: number) => {
    if (input.player.isPlaying) {
      input.player.stop();
    }
    const nextTarget = resolveWaveformUnitTarget(regionId);
    const shouldPreserveMultiSelection = input.selectedUtteranceIds.has(regionId) && input.selectedUtteranceIds.size > 1;
    if (!shouldPreserveMultiSelection) {
      input.selectTimelineUnit(nextTarget);
    }

    const ws = input.player.instanceRef.current;
    let splitTime = ws?.getCurrentTime() ?? 0;
    if (ws) {
      const wrapper = ws.getWrapper();
      const scrollParent = wrapper?.parentElement;
      if (wrapper && scrollParent) {
        const rect = scrollParent.getBoundingClientRect();
        const pxOffset = x - rect.left + scrollParent.scrollLeft;
        const totalWidth = wrapper.scrollWidth;
        const duration = ws.getDuration() || 1;
        splitTime = Math.max(0, Math.min(duration, (pxOffset / totalWidth) * duration));
      }
    }

    input.setCtxMenu({
      x,
      y,
      unitId: regionId,
      layerId: nextTarget.layerId,
      unitKind: nextTarget.kind,
      splitTime,
      source: 'waveform',
    });
  }, [input.activeLayerIdForEdits, input.player, input.selectTimelineUnit, input.selectedUtteranceIds, input.setCtxMenu, input.useSegmentWaveformRegions]);

  const handleWaveformRegionAltPointerDown = useCallback((regionId: string, time: number, pointerId: number, _clientX: number) => {
    input.subSelectDragRef.current = { active: false, regionId, anchorTime: time, pointerId };
    input.waveCanvasRef.current?.setPointerCapture(pointerId);
  }, [input.subSelectDragRef, input.waveCanvasRef]);

  const handleWaveformRegionClick = useCallback((regionId: string, clickTime: number, event: MouseEvent) => {
    if (input.player.isPlaying) {
      input.player.stop();
    }
    input.setSubSelectionRange(null);
    input.manualSelectTsRef.current = Date.now();
    input.player.seekTo(clickTime);
    const nextTarget = resolveWaveformUnitTarget(regionId);
    if (nextTarget.kind === 'segment') {
      if (event.shiftKey) {
        const anchor = resolveTranscriptionSelectionAnchor({
          expectedKind: 'segment',
          fallbackUnitId: regionId,
          selectedTimelineUnit: input.selectedTimelineUnit,
        });
        input.selectSegmentRange(anchor, regionId, input.waveformTimelineItems);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        input.toggleSegmentSelection(regionId);
        return;
      }
      input.selectTimelineUnit(nextTarget);
      return;
    }
    if (event.shiftKey) {
      const anchor = resolveTranscriptionSelectionAnchor({
        expectedKind: 'utterance',
        fallbackUnitId: regionId,
        selectedTimelineUnit: input.selectedTimelineUnit,
      });
      input.selectUtteranceRange(anchor, regionId);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      input.toggleUtteranceSelection(regionId);
      return;
    }
    input.selectTimelineUnit(nextTarget);
  }, [input.activeLayerIdForEdits, input.manualSelectTsRef, input.player, input.selectSegmentRange, input.selectTimelineUnit, input.selectUtteranceRange, input.selectedTimelineUnit, input.setSubSelectionRange, input.toggleSegmentSelection, input.toggleUtteranceSelection, input.useSegmentWaveformRegions, input.waveformTimelineItems]);

  const handleWaveformRegionDoubleClick = useCallback((_regionId: string, start: number, end: number) => {
    input.zoomToUtterance(start, end);
  }, [input.zoomToUtterance]);

  const handleWaveformRegionCreate = useCallback((start: number, end: number) => {
    fireAndForget(input.createUtteranceFromSelection(start, end));
  }, [input.createUtteranceFromSelection]);

  const handleWaveformRegionUpdate = useCallback((regionId: string, start: number, end: number) => {
    if (input.player.isPlaying) {
      input.player.stop();
    }
    input.beginTimingGesture(regionId);
    input.setDragPreview({ id: regionId, start, end });
    const item = input.waveformTimelineItems.find((timelineItem) => timelineItem.id === regionId);
    if (!item) return;
    const bounds = getNeighborBoundsRouted(regionId, item.mediaId, start, waveformLayerId);
    input.setSnapGuide(input.makeSnapGuide(bounds, start, end));
  }, [getNeighborBoundsRouted, input.beginTimingGesture, input.makeSnapGuide, input.player, input.setDragPreview, input.setSnapGuide, input.waveformTimelineItems, waveformLayerId]);

  const handleWaveformRegionUpdateEnd = useCallback((regionId: string, start: number, end: number) => {
    input.endTimingGesture(regionId);
    input.setDragPreview(null);
    input.manualSelectTsRef.current = Date.now();
    input.selectTimelineUnit(resolveWaveformUnitTarget(regionId));

    let finalStart = start;
    let finalEnd = end;
    if (input.snapEnabled) {
      const waveform = input.player.instanceRef.current;
      const buffer = waveform?.getDecodedData?.();
      if (buffer) {
        const snapped = snapToZeroCrossing(buffer, start, end);
        finalStart = snapped.start;
        finalEnd = snapped.end;
      }
    }

    const item = input.waveformTimelineItems.find((timelineItem) => timelineItem.id === regionId);
    if (item) {
      const bounds = getNeighborBoundsRouted(regionId, item.mediaId, finalStart, waveformLayerId);
      input.setSnapGuide(input.makeSnapGuide(bounds, finalStart, finalEnd));
    }

    const routing = waveformLayerId ? input.resolveSegmentRoutingForLayer(waveformLayerId) : undefined;
    let subdivisionClampedInRegionUpdate = false;
    if (waveformLayerId && routing?.segmentSourceLayer && routing.editMode === 'time-subdivision') {
      const parentUtterance = input.utterancesOnCurrentMedia.find(
        (utterance) => utterance.startTime <= finalStart + 0.01 && utterance.endTime >= finalEnd - 0.01,
      );
      if (parentUtterance) {
        const beforeClampStart = finalStart;
        const beforeClampEnd = finalEnd;
        const clampedStart = Math.max(finalStart, parentUtterance.startTime);
        const clampedEnd = Math.min(finalEnd, parentUtterance.endTime);
        subdivisionClampedInRegionUpdate = Math.abs(clampedStart - beforeClampStart) > 0.0005
          || Math.abs(clampedEnd - beforeClampEnd) > 0.0005;
        if (beforeClampStart < parentUtterance.startTime - 0.0005 || beforeClampEnd > parentUtterance.endTime + 0.0005) {
          input.setSaveState({ kind: 'error', message: t(uiLocale, 'transcription.timeline.timeSubdivisionClampExceeded') });
          input.setSnapGuide({ visible: false });
          return;
        }
        finalStart = clampedStart;
        finalEnd = clampedEnd;
      }
    }

    if (waveformLayerId && routing?.segmentSourceLayer) {
      fireAndForget((async () => {
        await LayerSegmentationV2Service.updateSegment(regionId, {
          startTime: Number(finalStart.toFixed(3)),
          endTime: Number(finalEnd.toFixed(3)),
          updatedAt: new Date().toISOString(),
        });
        await input.reloadSegments();
        if (subdivisionClampedInRegionUpdate) {
          input.setSaveState({ kind: 'done', message: t(uiLocale, 'transcription.timeline.timeSubdivisionClampAdjusted') });
        }
      })());
      return;
    }

    fireAndForget(saveTimingRouted(regionId, finalStart, finalEnd, waveformLayerId));
  }, [getNeighborBoundsRouted, input.activeLayerIdForEdits, input.endTimingGesture, input.makeSnapGuide, input.manualSelectTsRef, input.player.instanceRef, input.reloadSegments, input.resolveSegmentRoutingForLayer, input.selectTimelineUnit, input.setDragPreview, input.setSaveState, input.setSnapGuide, input.snapEnabled, input.utterancesOnCurrentMedia, input.useSegmentWaveformRegions, input.waveformTimelineItems, saveTimingRouted, waveformLayerId]);

  const handleWaveformTimeUpdate = useCallback((time: number) => {
    if (Date.now() - input.manualSelectTsRef.current < 600) return;
    if (input.creatingSegmentRef.current) return;
    if (input.markingModeRef.current) return;
    const items = input.waveformTimelineItems;
    let low = 0;
    let high = items.length - 1;
    let hit: WaveformTimelineItemLike | undefined;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const current = items[middle];
      if (!current) break;
      if (time < current.startTime) {
        high = middle - 1;
      } else if (time > current.endTime) {
        low = middle + 1;
      } else {
        hit = current;
        break;
      }
    }
    if (!hit || hit.id === input.selectedWaveformRegionId) return;
    input.selectTimelineUnit(resolveWaveformUnitTarget(hit.id));
  }, [input.activeLayerIdForEdits, input.creatingSegmentRef, input.manualSelectTsRef, input.markingModeRef, input.selectTimelineUnit, input.selectedWaveformRegionId, input.useSegmentWaveformRegions, input.waveformTimelineItems]);

  return {
    handleSearchReplace,
    handleJumpToEmbeddingMatch,
    handleJumpToCitation,
    handleSplitAtTimeRequest,
    handleZoomToSegmentRequest,
    getNeighborBoundsRouted,
    saveTimingRouted,
    handleWaveformRegionContextMenu,
    handleWaveformRegionAltPointerDown,
    handleWaveformRegionClick,
    handleWaveformRegionDoubleClick,
    handleWaveformRegionCreate,
    handleWaveformRegionUpdate,
    handleWaveformRegionUpdateEnd,
    handleWaveformTimeUpdate,
  };
}
