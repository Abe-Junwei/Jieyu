import type { LayerDocType } from '../db';

function dedupePreserveOrder(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 解析层的宿主转写 id 列表（译文层可多宿主；单宿主时仅 parentLayerId）。
 * | Resolve host transcription ids for a layer (translation may bind multiple hosts).
 */
export function getLayerParentIds(layer: Pick<LayerDocType, 'parentLayerId' | 'parentLayerIds'>): string[] {
  if (layer.parentLayerIds && layer.parentLayerIds.length > 0) {
    return dedupePreserveOrder(layer.parentLayerIds);
  }
  const single = layer.parentLayerId?.trim() ?? '';
  return single ? [single] : [];
}

export function getPrimaryParentLayerId(layer: Pick<LayerDocType, 'parentLayerId' | 'parentLayerIds'>): string | undefined {
  return getLayerParentIds(layer)[0];
}

export function translationLayerHasHost(
  layer: Pick<LayerDocType, 'layerType' | 'parentLayerId' | 'parentLayerIds'>,
  hostId: string,
): boolean {
  if (layer.layerType !== 'translation') return false;
  const h = hostId.trim();
  return h.length > 0 && getLayerParentIds(layer).includes(h);
}

/** 稳定序列化，用于比较父层集合是否变化 | Stable serialization for parent-set equality */
export function serializeLayerParentIds(layer: Pick<LayerDocType, 'parentLayerId' | 'parentLayerIds'>): string {
  return getLayerParentIds(layer).join('\u0000');
}

export function layerParentIdSetsEqual(
  a: Pick<LayerDocType, 'parentLayerId' | 'parentLayerIds'>,
  b: Pick<LayerDocType, 'parentLayerId' | 'parentLayerIds'>,
): boolean {
  const sa = new Set(getLayerParentIds(a));
  const sb = new Set(getLayerParentIds(b));
  if (sa.size !== sb.size) return false;
  for (const id of sa) {
    if (!sb.has(id)) return false;
  }
  return true;
}

/**
 * 规范化译文层宿主 id 写入字段：单宿主只写 parentLayerId；多宿主写 parentLayerIds 全量且 parentLayerId 为首选。
 * | Normalize translation host ids for persistence fields.
 */
export function normalizeTranslationParentIdsForWrite(
  hostIds: readonly string[],
): Pick<LayerDocType, 'parentLayerId' | 'parentLayerIds'> {
  const normalized = dedupePreserveOrder(hostIds);
  if (normalized.length === 0) return {};
  if (normalized.length === 1) {
    return { parentLayerId: normalized[0] };
  }
  return { parentLayerId: normalized[0], parentLayerIds: normalized };
}

/** 将宿主列表写回译文层对象（会删除不应存在的字段）| Apply host ids onto a translation layer doc */
export function applyTranslationHostIdsToLayer<T extends LayerDocType>(layer: T, hostIds: readonly string[]): T {
  const normalized = dedupePreserveOrder(hostIds);
  const next = { ...layer } as T & { parentLayerIds?: string[]; parentLayerId?: string };
  if (normalized.length === 0) {
    delete next.parentLayerIds;
    delete next.parentLayerId;
    return next as T;
  }
  if (normalized.length === 1) {
    next.parentLayerId = normalized[0];
    delete next.parentLayerIds;
    return next as T;
  }
  next.parentLayerId = normalized[0];
  next.parentLayerIds = [...normalized];
  return next as T;
}
