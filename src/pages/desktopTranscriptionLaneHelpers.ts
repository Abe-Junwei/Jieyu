import type { ChangeEvent, CSSProperties } from 'react';
import { annotationStyle, type LayerRowLayer } from './DesktopTranscriptionLayerRows';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';

export function mainAnnotationStyle(
  layers: readonly LayerRowLayer[] | undefined,
  layerId: string | null,
): CSSProperties | undefined {
  const layer = layers?.find((item) => item.id === layerId);
  return layer === undefined ? undefined : annotationStyle(layer);
}

export function timedOf(unit: { id: string; startMs: number | null; endMs: number | null }) {
  return unit.startMs === null || unit.endMs === null
    ? []
    : [{ id: unit.id, startMs: unit.startMs, endMs: unit.endMs }];
}

export function ignoreAnnotationEvent() {
  return undefined;
}

export function editBody(
  props: {
    onEditBody: (unitId: string, text: string, savedText: string) => void;
  },
  key: string,
  unit: DesktopPlaybackUnit,
  event: ChangeEvent<HTMLInputElement>,
) {
  props.onEditBody(key, event.target.value, unit.text);
}

/** The non-linked row that holds `unitId`, with its units shaped for the edge controller. */
export function subdivisionRow(layers: readonly LayerRowLayer[] | undefined, unitId: string) {
  const layer = layers?.find((item) => item.units.some((unit) => unit.id === unitId));
  if (!layer) return undefined;
  const units = layer.units.flatMap((unit) =>
    unit.startMs === null || unit.endMs === null
      ? []
      : [
          {
            id: unit.id,
            startTime: unit.startMs / 1000,
            endTime: unit.endMs / 1000,
            text: unit.text,
          },
        ],
  );
  return { units, timed: layer.units.flatMap(timedOf) };
}
