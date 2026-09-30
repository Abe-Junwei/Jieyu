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

export function annotationTextByLayer(
  input: AnnotationLayerTextInput,
): Map<string, Map<string, string>> {
  const layers = new Set(input.layerIds.filter((id) => id.length > 0));
  const out = new Map<string, Map<string, string>>();
  for (const row of input.contents) {
    const layerId = row.layerId ?? '';
    if (!layers.has(layerId)) continue;
    if (typeof row.modality === 'string' && row.modality.length > 0 && row.modality !== 'text') {
      continue;
    }
    const unitId = (row.unitId ?? '').trim();
    const text = (row.text ?? '').trim();
    if (unitId.length === 0 || text.length === 0) continue;
    const byUnit = out.get(layerId) ?? new Map<string, string>();
    if (!byUnit.has(unitId)) byUnit.set(unitId, text);
    out.set(layerId, byUnit);
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

/** URL `layerId` wins when it is a free translation layer. Otherwise keep the stored choice. */
export function resolveAnnotationTranslationLayerId(input: {
  layers: readonly { id: string }[];
  storedId: string;
  urlLayerId: string;
  literalLayerId: string;
}): { id: string; persist: boolean } {
  const blocked = input.literalLayerId.trim();
  const selectable = input.layers.filter((layer) => layer.id.length > 0 && layer.id !== blocked);
  const selectableIds = new Set(selectable.map((layer) => layer.id));
  const urlId = input.urlLayerId.trim();
  const storedId = input.storedId.trim();
  if (urlId.length > 0 && selectableIds.has(urlId)) {
    return { id: urlId, persist: urlId !== storedId };
  }
  if (storedId.length > 0 && selectableIds.has(storedId)) {
    return { id: storedId, persist: false };
  }
  const fallback = selectable[0]?.id ?? '';
  return { id: fallback, persist: storedId.length > 0 && storedId !== fallback };
}

/** Free translation stays off the literal layer. A selected id wins when it is still selectable. */
export function annotationFreeTranslationLayerId(
  layers: readonly { id: string }[],
  selectedId: string,
  literalLayerId: string,
): string {
  const blocked = literalLayerId.trim();
  const selectable = layers.filter((layer) => layer.id !== blocked);
  if (selectedId.length > 0 && selectable.some((layer) => layer.id === selectedId)) {
    return selectedId;
  }
  return selectable[0]?.id ?? '';
}
