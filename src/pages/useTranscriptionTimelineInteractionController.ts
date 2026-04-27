import { startTransition, useCallback, useRef } from 'react';
import { LayerSegmentationV2Service } from '../utils/pageLayerSegmentationV2';
import { handleTranscriptionCitationJump } from './TranscriptionPage.citationJump';
import { snapToZeroCrossing } from '../utils/pageAudioAnalysisSnap';
import { fireAndForget } from '../utils/fireAndForget';
import { t } from '../i18n';
import { createLogger } from '../observability/logger';
import { readStoredWaveformDoubleClickAction } from '../utils/transcriptionInteractionPreferences';
import { isTranscriptionPerfDebugEnabled } from '../utils/transcriptionPerfDebug';
import { resolveTranscriptionSelectionAnchor, resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';
import type { UseTranscriptionTimelineInteractionControllerInput, UseTranscriptionTimelineInteractionControllerResult, WaveformTimelineItemLike } from '../types/useTranscriptionTimelineInteractionController.types';
const log = createLogger('useTranscriptionTimelineInteractionController');

export function useTranscriptionTimelineInteractionController(
  input: UseTranscriptionTimelineInteractionControllerInput,
): UseTranscriptionTimelineInteractionControllerResult {
  const uiLocale = input.locale as Parameters<typeof t>[0];
  const waveformLayerId = input.useSegmentWaveformRegions ? input.activeLayerIdForEdits : undefined;
  const resolveWaveformUnitTarget = (unitId: string) => resolveTranscriptionUnitTarget({
    layerId: input.activeLayerIdForEdits,
    unitId,
    preferredKind: input.useSegmentWaveformRegions ? 'segment' : 'unit',
  });

  const resolveSubdivisionParentUnit = useCallback((segmentId: string, layerId: string, proposedStart?: number, proposedEnd?: number) => {
    const routing = input.resolveSegmentRoutingForLayer(layerId);
    if (!routing.segmentSourceLayer) return undefined;

    const segmentRow = input.segmentsByLayer.get(routing.sourceLayerId)?.find((segment) => segment.id === segmentId);
    const parentUnitId = typeof segmentRow?.unitId === 'string' && segmentRow.unitId.trim().length > 0
      ? segmentRow.unitId.trim()
      : undefined;

    if (parentUnitId) {
      return input.unitsOnCurrentMedia.find((unit) => unit.id === parentUnitId);
    }

    const fallbackStart = segmentRow?.startTime ?? proposedStart;
    const fallbackEnd = segmentRow?.endTime ?? proposedEnd ?? fallbackStart;
    if (typeof fallbackStart !== 'number' || typeof fallbackEnd !== 'number') {
      return undefined;
    }

    return input.unitsOnCurrentMedia.find(
      (unit) => unit.startTime <= fallbackStart + 0.01 && unit.endTime >= fallbackEnd - 0.01,
    );
  }, [input.resolveSegmentRoutingForLayer, input.segmentsByLayer, input.unitsOnCurrentMedia]);

  const handleSearchReplace = useCallback((unitId: string, layerId: string | undefined, _oldText: string, newText: string) => {
    if (layerId) {
      const targetLayer = input.layers.find((layer) => layer.id === layerId);
      if (targetLayer?.layerType === 'transcription') {
        void input.saveUnitText(unitId, newText, layerId);
        return;
      }
      void input.saveUnitLayerText(unitId, newText, layerId);
      return;
    }
    void input.saveUnitText(unitId, newText);
  }, [input.layers, input.saveUnitLayerText, input.saveUnitText]);

  const handleJumpToEmbeddingMatch = useCallback((unitId: string) => {
    if (!unitId) return;
    const target = input.units.find((item) => item.id === unitId)
      ?? input.waveformTimelineItems.find((item) => item.id === unitId);
    input.selectUnit(unitId);
    if (!target) return;
    input.manualSelectTsRef.current = Date.now();
    input.player.seekTo(target.startTime);
  }, [input.manualSelectTsRef, input.player, input.selectUnit, input.units, input.waveformTimelineItems]);

  const handleJumpToCitation = useCallback(async (
    citationType: 'unit' | 'note' | 'pdf' | 'schema',
    refId: string,
    citationRef?: { snippet?: string },
  ) => {
    await handleTranscriptionCitationJump({
      locale: input.locale,
      citationType,
      refId,
      ...(citationRef ? { citationRef } : {}),
      sidePaneRows: input.sidePaneRows,
      activeTimelineUnitId: input.activeTimelineUnitId,
      onJumpToEmbeddingMatch: handleJumpToEmbeddingMatch,
      onSetNotePopover: input.onSetNotePopover,
      onSetSidebarError: input.onSetSidebarError,
      onRevealSchemaLayer: input.onRevealSchemaLayer,
      onOpenPdfPreviewRequest: input.onOpenPdfPreviewRequest,
    });
  }, [handleJumpToEmbeddingMatch, input.sidePaneRows, input.locale, input.onOpenPdfPreviewRequest, input.onRevealSchemaLayer, input.onSetNotePopover, input.onSetSidebarError, input.activeTimelineUnitId]);

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
      input.zoomToUnit(target.startTime, target.endTime);
    }
    return true;
  }, [input.activeLayerIdForEdits, input.manualSelectTsRef, input.player, input.selectTimelineUnit, input.useSegmentWaveformRegions, input.waveformTimelineItems, input.zoomToPercent, input.zoomToUnit]);

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
          const parentUnit = resolveSubdivisionParentUnit(itemId, layerId, probeStart, probeStart + 0.1);
          if (parentUnit) {
            left = Math.max(left, parentUnit.startTime);
            right = right !== undefined ? Math.min(right, parentUnit.endTime) : parentUnit.endTime;
          }
        }
        return { left, right };
      }
    }
    return input.getNeighborBounds(itemId, mediaId, probeStart);
  }, [input.getNeighborBounds, input.resolveSegmentRoutingForLayer, input.segmentsByLayer, input.unitsOnCurrentMedia]);

  const saveTimingRouted = useCallback(async (id: string, start: number, end: number, layerId?: string) => {
    if (layerId) {
      const routing = input.resolveSegmentRoutingForLayer(layerId);
      if (routing.segmentSourceLayer) {
        let finalStart = start;
        let finalEnd = end;
        let subdivisionClampedInResize = false;
        if (routing.editMode === 'time-subdivision') {
          const parentUnit = resolveSubdivisionParentUnit(id, layerId, finalStart, finalEnd);
          if (parentUnit) {
            const beforeClampStart = finalStart;
            const beforeClampEnd = finalEnd;
            finalStart = Math.max(finalStart, parentUnit.startTime);
            finalEnd = Math.min(finalEnd, parentUnit.endTime);
            if (finalEnd <= finalStart + 0.0005) {
              input.setSaveState({ kind: 'error', message: t(uiLocale, 'transcription.timeline.timeSubdivisionClampExceeded') });
              return;
            }
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
    await input.saveUnitTiming(id, start, end);
  }, [input.reloadSegments, input.resolveSegmentRoutingForLayer, input.saveUnitTiming, input.setSaveState, input.unitsOnCurrentMedia]);

  const handleWaveformRegionContextMenu = useCallback((regionId: string, x: number, y: number) => {
    if (input.player.isPlaying) {
      input.player.stop();
    }
    const nextTarget = resolveWaveformUnitTarget(regionId);
    const shouldPreserveMultiSelection = input.selectedUnitIds.has(regionId) && input.selectedUnitIds.size > 1;
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

    const timelineItem = input.waveformTimelineItems.find((item) => item.id === regionId);
    const menuLayerIdFromItem = typeof timelineItem?.layerId === 'string' ? timelineItem.layerId.trim() : '';
    const ctxMenuLayerId = menuLayerIdFromItem.length > 0 ? menuLayerIdFromItem : nextTarget.layerId;
    const row = input.layers.find((layer) => layer.id === ctxMenuLayerId);
    const layerType = row?.layerType === 'translation' ? 'translation' : 'transcription';
    input.setCtxMenu({
      x,
      y,
      unitId: regionId,
      layerId: ctxMenuLayerId,
      unitKind: nextTarget.kind,
      splitTime,
      source: 'waveform',
      menuSurface: 'waveform-region',
      layerType,
    });
  }, [input.activeLayerIdForEdits, input.layers, input.player, input.selectTimelineUnit, input.selectedUnitIds, input.setCtxMenu, input.useSegmentWaveformRegions, input.waveformTimelineItems]);

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
    // 选段级联渲染降为低优先级；WaveSurfer 已即时处理视觉高亮 | Defer selection cascade render; WaveSurfer already handles visual highlight
    const nextTarget = resolveWaveformUnitTarget(regionId);
    startTransition(() => {
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
          expectedKind: 'unit',
          fallbackUnitId: regionId,
          selectedTimelineUnit: input.selectedTimelineUnit,
        });
        input.selectUnitRange(anchor, regionId);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        input.toggleUnitSelection(regionId);
        return;
      }
      input.selectTimelineUnit(nextTarget);
    });
  }, [input.activeLayerIdForEdits, input.manualSelectTsRef, input.player, input.selectSegmentRange, input.selectTimelineUnit, input.selectUnitRange, input.selectedTimelineUnit, input.setSubSelectionRange, input.toggleSegmentSelection, input.toggleUnitSelection, input.useSegmentWaveformRegions, input.waveformTimelineItems]);

  const handleWaveformRegionDoubleClick = useCallback((_regionId: string, start: number, end: number) => {
    const preferCreateSegment = readStoredWaveformDoubleClickAction() === 'create-segment';
    if (preferCreateSegment && !input.useSegmentWaveformRegions) {
      fireAndForget(input.createUnitFromSelection(start, end), { context: 'src/pages/useTranscriptionTimelineInteractionController.ts:L277', policy: 'user-visible' });
      return;
    }
    input.zoomToUnit(start, end);
  }, [input.createUnitFromSelection, input.useSegmentWaveformRegions, input.zoomToUnit]);

  const handleWaveformRegionCreate = useCallback((start: number, end: number) => {
    if (isTranscriptionPerfDebugEnabled()) {
      log.warn('Waveform region create requested', {
        start,
        end,
        spanMs: Math.round(Math.max(0, end - start) * 1000),
      });
    }
    fireAndForget(input.createUnitFromSelection(start, end), { context: 'src/pages/useTranscriptionTimelineInteractionController.ts:L291', policy: 'user-visible' });
  }, [input.createUnitFromSelection]);

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
    // 选区更新不阻塞拖拽结束帧 | Selection update should not block drag-end paint
    startTransition(() => {
      input.selectTimelineUnit(resolveWaveformUnitTarget(regionId));
    });

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
      const parentUnit = resolveSubdivisionParentUnit(regionId, waveformLayerId, finalStart, finalEnd);
      if (parentUnit) {
        const beforeClampStart = finalStart;
        const beforeClampEnd = finalEnd;
        const clampedStart = Math.max(finalStart, parentUnit.startTime);
        const clampedEnd = Math.min(finalEnd, parentUnit.endTime);
        subdivisionClampedInRegionUpdate = Math.abs(clampedStart - beforeClampStart) > 0.0005
          || Math.abs(clampedEnd - beforeClampEnd) > 0.0005;
        if (beforeClampStart < parentUnit.startTime - 0.0005 || beforeClampEnd > parentUnit.endTime + 0.0005) {
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
      })(), { context: 'src/pages/useTranscriptionTimelineInteractionController.ts:L355', policy: 'user-visible' });
      return;
    }

    fireAndForget(saveTimingRouted(regionId, finalStart, finalEnd, waveformLayerId), { context: 'src/pages/useTranscriptionTimelineInteractionController.ts:L369', policy: 'user-visible' });
  }, [getNeighborBoundsRouted, input.activeLayerIdForEdits, input.endTimingGesture, input.makeSnapGuide, input.manualSelectTsRef, input.player.instanceRef, input.reloadSegments, input.resolveSegmentRoutingForLayer, input.selectTimelineUnit, input.setDragPreview, input.setSaveState, input.setSnapGuide, input.snapEnabled, input.unitsOnCurrentMedia, input.useSegmentWaveformRegions, input.waveformTimelineItems, saveTimingRouted, waveformLayerId]);

  // 播放跟随选区：节流 + startTransition（Descript / DAW 模式）| Playback follow-selection: throttle + startTransition (Descript / DAW pattern)
  const timeUpdateThrottleRef = useRef(0);
  const handleWaveformTimeUpdate = useCallback((time: number) => {
    if (Date.now() - input.manualSelectTsRef.current < 600) return;
    if (input.creatingSegmentRef.current) return;
    if (input.markingModeRef.current) return;
    // 节流：播放中跟随选区不必每帧触发，120ms≈8fps 足够 | Throttle: follow-selection during playback at ~8fps is sufficient
    const now = Date.now();
    if (now - timeUpdateThrottleRef.current < 120) return;
    timeUpdateThrottleRef.current = now;
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
    // WaveSurfer 原生高亮已提供即时视觉反馈，React 选区同步降为低优先级 | WaveSurfer native highlight already gives instant visual feedback; React selection sync is low-priority
    startTransition(() => {
      input.selectTimelineUnit(resolveWaveformUnitTarget(hit!.id));
    });
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
