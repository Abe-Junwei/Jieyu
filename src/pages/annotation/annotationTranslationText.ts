import type { LayerDocType, LayerUnitContentDocType } from '../../types/jieyuDbDocTypes';

type AnnotationLayerTextInput = {
  contents: readonly Pick<LayerUnitContentDocType, 'unitId' | 'layerId' | 'modality' | 'text'>[];
  layerIds: readonly string[];
};

export function annotationLayerLabel(layer: Pick<LayerDocType, 'name' | 'key'>): string {
  const values = Object.values(layer.name)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values[0] ?? layer.key;
}

/** First non-empty text wins. Callers should pass newest rows first. */
export function pickAnnotationLayerText(input: AnnotationLayerTextInput): Map<string, string> {
  const layers = new Set(input.layerIds.filter((id) => id.length > 0));
  const out = new Map<string, string>();
  if (layers.size === 0) return out;
  for (const row of input.contents) {
    const layerId = row.layerId ?? '';
    if (!layers.has(layerId)) continue;
    if (typeof row.modality === 'string' && row.modality.length > 0 && row.modality !== 'text') {
      continue;
    }
    const unitId = (row.unitId ?? '').trim();
    const text = (row.text ?? '').trim();
    if (unitId.length === 0 || text.length === 0 || out.has(unitId)) continue;
    out.set(unitId, text);
  }
  return out;
}

export function pickAnnotationTranslationText(input: {
  contents: AnnotationLayerTextInput['contents'];
  translationLayerIds: readonly string[];
}): Map<string, string> {
  return pickAnnotationLayerText({
    contents: input.contents,
    layerIds: input.translationLayerIds,
  });
}
