import { resolveWaveformPointerClientXToDocSec } from '../utils/waveformPointerClientXToDocSec';
import type { WaveformTimelineItemLike } from '../types/useTranscriptionTimelineInteractionController.types';

type TimingUnitLike = {
  id: string;
  startTime: number;
  endTime: number;
  unitId?: string | undefined;
};

type LayerLike = {
  id: string;
};

type WaveSurferSurfaceLike = {
  getDuration: () => number;
  getWrapper: () => HTMLElement;
};

export type WaveformSurfacePointerInput = {
  clientX: number;
  fallbackTime: number;
  ws: WaveSurferSurfaceLike | null | undefined;
  waveCanvas: HTMLElement | null;
  documentSpanSec?: number;
  zoomPxPerSec?: number;
  tierScrollLeftPx: number;
  allowWrapperFallback?: boolean;
};

export function resolveWaveformSurfacePointerTime(input: WaveformSurfacePointerInput): number {
  const { ws, fallbackTime } = input;
  if (!ws) return fallbackTime;

  const documentSpanSec =
    typeof input.documentSpanSec === 'number' &&
    Number.isFinite(input.documentSpanSec) &&
    input.documentSpanSec > 0
      ? input.documentSpanSec
      : ws.getDuration();
  const zoomPxPerSec =
    typeof input.zoomPxPerSec === 'number' &&
    Number.isFinite(input.zoomPxPerSec) &&
    input.zoomPxPerSec > 0
      ? input.zoomPxPerSec
      : 0;
  const viewportRectLeftPx =
    input.waveCanvas?.getBoundingClientRect().left ??
    ws.getWrapper()?.parentElement?.getBoundingClientRect().left;
  if (typeof viewportRectLeftPx === 'number' && zoomPxPerSec > 0) {
    const mapped = resolveWaveformPointerClientXToDocSec({
      clientX: input.clientX,
      viewportRectLeftPx,
      ws,
      tierScrollLeftPx: input.tierScrollLeftPx,
      documentSpanSec,
      pxPerDocSec: zoomPxPerSec,
      logicalDurationSec: documentSpanSec,
    });
    if (mapped !== null) return mapped;
  }

  if (!input.allowWrapperFallback) return fallbackTime;

  const wrapper = ws.getWrapper();
  const scrollParent = wrapper?.parentElement;
  if (!wrapper || !scrollParent) return fallbackTime;
  const rect = scrollParent.getBoundingClientRect();
  const pxOffset = input.clientX - rect.left + scrollParent.scrollLeft;
  const totalWidth = wrapper.scrollWidth;
  const duration = ws.getDuration() || 1;
  return Math.max(0, Math.min(duration, (pxOffset / totalWidth) * duration));
}

export function clampPointerTimeToRegion(
  mappedTime: number,
  regionId: string,
  items: readonly WaveformTimelineItemLike[],
): number {
  const timelineItem = items.find((item) => item.id === regionId);
  const regionStart = timelineItem?.startTime ?? mappedTime;
  const regionEnd = timelineItem?.endTime ?? mappedTime;
  return Math.max(regionStart, Math.min(regionEnd, mappedTime));
}

export type SubdivisionRouting = {
  segmentSourceLayer: LayerLike | undefined;
  sourceLayerId: string;
  editMode: 'unit' | 'independent-segment' | 'time-subdivision';
};

export function resolveSubdivisionParentUnit(input: {
  segmentId: string;
  layerId: string;
  proposedStart?: number;
  proposedEnd?: number;
  routing: SubdivisionRouting;
  segmentsByLayer: ReadonlyMap<string, TimingUnitLike[]>;
  unitsOnCurrentMedia: readonly TimingUnitLike[];
}): TimingUnitLike | undefined {
  if (!input.routing.segmentSourceLayer) return undefined;

  const segmentRow = input.segmentsByLayer
    .get(input.routing.sourceLayerId)
    ?.find((segment) => segment.id === input.segmentId);
  const parentUnitId =
    typeof segmentRow?.unitId === 'string' && segmentRow.unitId.trim().length > 0
      ? segmentRow.unitId.trim()
      : undefined;

  if (parentUnitId) {
    return input.unitsOnCurrentMedia.find((unit) => unit.id === parentUnitId);
  }

  const fallbackStart = segmentRow?.startTime ?? input.proposedStart;
  const fallbackEnd = segmentRow?.endTime ?? input.proposedEnd ?? fallbackStart;
  if (typeof fallbackStart !== 'number' || typeof fallbackEnd !== 'number') {
    return undefined;
  }

  return input.unitsOnCurrentMedia.find(
    (unit) => unit.startTime <= fallbackStart + 0.01 && unit.endTime >= fallbackEnd - 0.01,
  );
}

export function getNeighborBoundsRouted(input: {
  itemId: string;
  mediaId: string | undefined;
  probeStart: number;
  layerId?: string;
  routing?: SubdivisionRouting;
  segmentsByLayer: ReadonlyMap<string, TimingUnitLike[]>;
  unitsOnCurrentMedia: readonly TimingUnitLike[];
  getNeighborBounds: (
    itemId: string,
    mediaId: string | undefined,
    probeStart: number,
  ) => { left: number; right: number | undefined };
}): { left: number; right: number | undefined } {
  const { layerId, routing } = input;
  if (layerId && routing?.segmentSourceLayer) {
    const segments = input.segmentsByLayer.get(routing.sourceLayerId) ?? [];
    const siblings = segments
      .filter((segment) => segment.id !== input.itemId)
      .sort((left, right) => left.startTime - right.startTime);
    const timeline = [
      ...siblings,
      { id: input.itemId, startTime: input.probeStart, endTime: input.probeStart + 0.1 },
    ].sort((left, right) => left.startTime - right.startTime);
    const index = timeline.findIndex((segment) => segment.id === input.itemId);
    const prev = index > 0 ? timeline[index - 1] : undefined;
    const next = index >= 0 && index < timeline.length - 1 ? timeline[index + 1] : undefined;
    let left = prev ? prev.endTime + 0.02 : 0;
    let right: number | undefined = next ? next.startTime - 0.02 : undefined;
    if (routing.editMode === 'time-subdivision') {
      const parentUnit = resolveSubdivisionParentUnit({
        segmentId: input.itemId,
        layerId,
        proposedStart: input.probeStart,
        proposedEnd: input.probeStart + 0.1,
        routing,
        segmentsByLayer: input.segmentsByLayer,
        unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      });
      if (parentUnit) {
        left = Math.max(left, parentUnit.startTime);
        right = right !== undefined ? Math.min(right, parentUnit.endTime) : parentUnit.endTime;
      }
    }
    return { left, right };
  }
  return input.getNeighborBounds(input.itemId, input.mediaId, input.probeStart);
}
