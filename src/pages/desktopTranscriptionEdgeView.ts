import type { CSSProperties } from 'react';
import { t, tf, type Locale } from '../i18n';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';
import type { ShownPreview } from './desktopTranscriptionEdgePointer';

const EDGE_REASON = {
  overlap: 'app.desktopTranscription.edgeOverlap',
  outside: 'app.desktopTranscription.edgeOutside',
  outsideParent: 'app.desktopTranscription.edgeOutsideParent',
  short: 'app.desktopTranscription.edgeShort',
  createShort: 'app.desktopTranscription.createShort',
  noParent: 'app.desktopTranscription.createNoParent',
  hasChildren: 'app.desktopTranscription.edgeHasChildren',
  noLayer: 'app.desktopTranscription.createNoLayer',
  apart: 'app.desktopTranscription.edgeNotTouching',
  order: 'app.desktopTranscription.edgeOrder',
  failed: 'app.desktopTranscription.edgeFailed',
  unknown: 'app.desktopTranscription.edgeUnknown',
  stale: 'app.desktopTranscription.edgeStale',
} as const;

export function edgeNotice(locale: Locale, kind: keyof typeof EDGE_REASON, time: string): string {
  const reason = t(locale, EDGE_REASON[kind]);
  if (time.length === 0) return reason;
  return tf(locale, 'app.desktopTranscription.edgeRejected', { reason, time });
}

/** A subdivision child of the dragged unit is shown clamped to the unit's previewed range. */
export function playbackWithPreview(
  unit: DesktopPlaybackUnit,
  preview: ShownPreview | null,
  parentUnitId?: string | null,
): DesktopPlaybackUnit {
  if (preview?.unitId != null && parentUnitId === preview.unitId) {
    const startTime = Math.max(unit.startTime, preview.startMs / 1000);
    const endTime = Math.min(unit.endTime, preview.endMs / 1000);
    return startTime === unit.startTime && endTime === unit.endTime
      ? unit
      : { ...unit, startTime, endTime };
  }
  if (preview?.unitId === unit.id) {
    return { ...unit, startTime: preview.startMs / 1000, endTime: preview.endMs / 1000 };
  }
  if (
    preview?.otherId === unit.id &&
    preview.otherStartMs !== null &&
    preview.otherEndMs !== null
  ) {
    return { ...unit, startTime: preview.otherStartMs / 1000, endTime: preview.otherEndMs / 1000 };
  }
  return unit;
}

export function seamSeconds(
  edge: { edge: string; unitId: string; otherId: string | null } | null,
  preview: ShownPreview | null,
  units: readonly DesktopPlaybackUnit[],
): number | null {
  if (edge?.edge !== 'shared') return null;
  if (preview && preview.otherId !== null) {
    return (preview.otherStartMs === preview.endMs ? preview.endMs : preview.startMs) / 1000;
  }
  const unit = units.find((item) => item.id === edge.unitId);
  const other = units.find((item) => item.id === edge.otherId);
  if (!unit || !other) return null;
  return unit.endTime === other.startTime ? unit.endTime : unit.startTime;
}

export function desktopSegmentFrame(
  unit: DesktopPlaybackUnit,
  duration: number,
  index: number,
  count: number,
  zoomPxPerSec: number,
): CSSProperties {
  if (zoomPxPerSec > 0 && unit.endTime > unit.startTime) {
    return {
      left: unit.startTime * zoomPxPerSec,
      width: Math.max(1, (unit.endTime - unit.startTime) * zoomPxPerSec),
    };
  }
  if (duration > 0 && unit.endTime > unit.startTime) {
    return {
      left: `${(unit.startTime / duration) * 100}%`,
      width: `${((unit.endTime - unit.startTime) / duration) * 100}%`,
    };
  }
  const share = 100 / Math.max(count, 1);
  return { left: `${index * share}%`, width: `${share}%` };
}

export function seamLeft(seconds: number, duration: number, zoomPxPerSec: number): number | string {
  if (zoomPxPerSec > 0) return seconds * zoomPxPerSec;
  if (duration > 0) return `${(seconds / duration) * 100}%`;
  return 0;
}

interface FollowRow {
  units: readonly {
    parentUnitId?: string | null;
    startMs: number | null;
    endMs: number | null;
  }[];
}

/** The children a parent-edge drag would clamp, and the edge time they follow to. */
export function followTip(
  layers: readonly FollowRow[],
  preview: ShownPreview | null,
): { count: number; edge: 'start' | 'end'; timeMs: number } | null {
  if (preview?.unitId == null) return null;
  let count = 0;
  let startMoves = false;
  for (const layer of layers) {
    for (const unit of layer.units) {
      if (unit.parentUnitId !== preview.unitId || unit.startMs === null || unit.endMs === null) {
        continue;
      }
      const early = unit.startMs < preview.startMs;
      if (early || unit.endMs > preview.endMs) count += 1;
      if (early) startMoves = true;
    }
  }
  if (count === 0) return null;
  return startMoves
    ? { count, edge: 'start', timeMs: preview.startMs }
    : { count, edge: 'end', timeMs: preview.endMs };
}
