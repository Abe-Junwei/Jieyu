import type { LayerUnitContentDocType } from '../../types/jieyuDbDocTypes';

/** First non-empty text wins. Callers should pass newest rows first. */
export function pickAnnotationTranslationText(input: {
  contents: readonly Pick<LayerUnitContentDocType, 'unitId' | 'layerId' | 'modality' | 'text'>[];
  translationLayerIds: readonly string[];
}): Map<string, string> {
  const layers = new Set(input.translationLayerIds.filter((id) => id.length > 0));
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
