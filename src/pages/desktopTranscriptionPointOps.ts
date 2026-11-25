import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, type Locale } from '../i18n';

export interface PointView {
  id: string;
  timeMs: number;
  label: string;
}

export interface PointRef {
  layerId: string;
  pointId: string;
}

export interface PointDragPreview {
  layerId: string;
  pointId: string;
  timeMs: number;
}

export interface PointMenuState {
  layerId: string;
  pointId: string;
  x: number;
  y: number;
}

export type PointLayer = {
  id: string;
  contentType?: string;
  points?: readonly PointView[];
};

export function clampPointMs(ms: number, durationSec: number): number {
  const max = Math.max(0, Math.round(durationSec * 1000));
  return Math.min(Math.max(0, Math.round(ms)), max);
}

export function sortedLayerPoints(layers: readonly PointLayer[], layerId: string): PointView[] {
  const layer = layers.find((row) => row.id === layerId);
  return [...(layer?.points ?? [])].sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id));
}

export function pointFailureText(locale: Locale, caught: unknown): string {
  const message = caught instanceof Error ? caught.message : '';
  if (message.includes('point time is taken')) {
    return t(locale, 'app.desktopTranscription.pointTimeTaken');
  }
  if (message.includes('point is outside the media')) {
    return t(locale, 'app.desktopTranscription.pointOutsideMedia');
  }
  if (message.includes('edit outcome is unknown')) {
    return t(locale, 'app.desktopTranscription.pointActionUnknown');
  }
  return t(locale, 'app.desktopTranscription.pointActionFailed');
}

export function pointClient(
  sessionId: string | null,
  desktopCall: DesktopReadHost['desktopCall'] | undefined,
): ReturnType<typeof createDesktopClient> | null {
  if (sessionId === null || desktopCall === undefined) return null;
  return createDesktopClient({ desktopCall });
}

export async function createPointAt(input: {
  sessionId: string;
  desktopCall: DesktopReadHost['desktopCall'];
  layerId: string;
  timeMs: number;
  durationSec: number;
}): Promise<{ id: string; timeMs: number }> {
  const api = pointClient(input.sessionId, input.desktopCall);
  if (api === null) throw new Error('desktop host is missing');
  const point = await api.createPoint(input.sessionId, {
    layerId: input.layerId,
    timeMs: clampPointMs(input.timeMs, input.durationSec),
    label: '',
  });
  return { id: point.id, timeMs: point.timeMs };
}

export async function savePointLabel(input: {
  sessionId: string;
  desktopCall: DesktopReadHost['desktopCall'];
  pointId: string;
  label: string;
}): Promise<void> {
  const api = pointClient(input.sessionId, input.desktopCall);
  if (api === null) throw new Error('desktop host is missing');
  await api.updatePointLabel(input.sessionId, { id: input.pointId, label: input.label });
}

export async function savePointMove(input: {
  sessionId: string;
  desktopCall: DesktopReadHost['desktopCall'];
  pointId: string;
  timeMs: number;
  durationSec: number;
}): Promise<void> {
  const api = pointClient(input.sessionId, input.desktopCall);
  if (api === null) throw new Error('desktop host is missing');
  await api.movePoint(input.sessionId, {
    id: input.pointId,
    timeMs: clampPointMs(input.timeMs, input.durationSec),
  });
}

export async function removePoint(input: {
  sessionId: string;
  desktopCall: DesktopReadHost['desktopCall'];
  pointId: string;
}): Promise<void> {
  const api = pointClient(input.sessionId, input.desktopCall);
  if (api === null) throw new Error('desktop host is missing');
  await api.deletePoint(input.sessionId, input.pointId);
}

export function neighborPoint(
  layers: readonly PointLayer[],
  selected: PointRef,
  step: -1 | 1 | 'home' | 'end',
): PointView | undefined {
  const points = sortedLayerPoints(layers, selected.layerId);
  const index = points.findIndex((point) => point.id === selected.pointId);
  if (index < 0) return undefined;
  if (step === 'home') return points[0];
  if (step === 'end') return points[points.length - 1];
  return points[index + step];
}
