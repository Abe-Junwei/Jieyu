import type { LayerDocType, LayerUnitDocType } from '../../types/jieyuDbDocTypes';
import {
  buildTranscriptionLaneReadScopeResolutionCache,
  resolveCanonicalUnitForTranscriptionLaneRow,
  resolvePrimaryUnscopedTranscriptionHostId,
} from './annotationLaneReadScope';

function compareUnits(a: LayerUnitDocType, b: LayerUnitDocType): number {
  if (a.startTime !== b.startTime) return a.startTime - b.startTime;
  return a.id.localeCompare(b.id);
}

export function projectAnnotationLaneUnits(input: {
  units: readonly LayerUnitDocType[];
  layers: readonly LayerDocType[];
  mediaId: string;
}): LayerUnitDocType[] {
  const mediaScoped =
    input.mediaId.length === 0
      ? [...input.units]
      : (() => {
          const matched = input.units.filter((unit) => unit.mediaId === input.mediaId);
          return matched.length > 0 ? matched : [...input.units];
        })();
  const transcriptionLayers = input.layers.filter((layer) => layer.layerType === 'transcription');
  const lane = transcriptionLayers[0];
  if (lane === undefined) {
    return mediaScoped.filter((unit) => unit.tags?.skipProcessing !== true).sort(compareUnits);
  }
  const layerById = new Map(input.layers.map((layer) => [layer.id, layer]));
  const transcriptionLaneIds = new Set(transcriptionLayers.map((layer) => layer.id));
  const primaryUnscopedHostId = resolvePrimaryUnscopedTranscriptionHostId(
    transcriptionLayers,
    lane.id,
  );
  const readScopeCache = buildTranscriptionLaneReadScopeResolutionCache({
    transcriptionLanes: transcriptionLayers,
    layerById,
    transcriptionLaneIds,
    primaryUnscopedHostId,
  });
  const projected: LayerUnitDocType[] = [];
  for (const unit of mediaScoped) {
    const resolved = resolveCanonicalUnitForTranscriptionLaneRow({
      unit,
      laneLayer: lane,
      layerById,
      transcriptionLaneIds,
      primaryUnscopedHostId,
      readScopeCache,
    });
    if (resolved.include) projected.push(resolved.row);
  }
  return projected.sort(compareUnits);
}
