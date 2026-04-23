/**
 * 翻译层宿主 link 只读查询（layer_links 单源）| Read-only translation host queries from layer_links (SSOT)
 *
 * 集中解析 hostTranscriptionLayerId / transcriptionLayerKey → 宿主转写层 id，
 * 避免各模块重复实现 filter + trim + key 回落。
 * Centralizes host id resolution so resolvers, comparison view, constraints, and ordering share one contract.
 */

import type { LayerDocType, LayerLinkDocType } from '../db';

export type TranslationHostLink = Pick<
  LayerLinkDocType,
  'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'
>;

/** 从转写层列表构建 key → id（每 key 首次出现 wins）| Build transcription key → layer id map */
export function buildTranscriptionIdByKeyMap(
  layers: ReadonlyArray<LayerDocType> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!layers) return map;
  for (const layer of layers) {
    if (layer.layerType !== 'transcription') continue;
    const key = layer.key?.trim() ?? '';
    if (key.length === 0 || map.has(key)) continue;
    map.set(key, layer.id);
  }
  return map;
}

/**
 * 解析单条 layer_link 指向的宿主转写层 id（id 字段优先，否则 key→id）|
 * Resolve host transcription layer id for one link (id field first, else key→id).
 */
export function resolveLayerLinkHostTranscriptionLayerId(
  link: Pick<LayerLinkDocType, 'transcriptionLayerKey' | 'hostTranscriptionLayerId'>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
): string {
  const resolveCandidate = (raw: string): string => {
    const candidate = raw.trim();
    if (candidate.length === 0) return '';
    const mapped = transcriptionIdByKey.get(candidate);
    if (mapped) return mapped;
    for (const id of transcriptionIdByKey.values()) {
      if (id === candidate) return id;
    }
    return '';
  };

  const hostId = typeof link.hostTranscriptionLayerId === 'string' ? link.hostTranscriptionLayerId.trim() : '';
  if (hostId.length === 0) {
    const legacyKey = typeof link.transcriptionLayerKey === 'string' ? link.transcriptionLayerKey : '';
    return resolveCandidate(legacyKey);
  }

  const resolvedHost = resolveCandidate(hostId);
  if (resolvedHost.length > 0) return resolvedHost;
  return hostId;
}

/** 某翻译层的全部宿主转写 id（去重，顺序为 link 表顺序）| Distinct host transcription ids for a translation layer */
export function getHostTranscriptionLayerIdsForTranslation(
  translationLayerId: string,
  layerLinks: ReadonlyArray<TranslationHostLink>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const link of layerLinks) {
    if (link.layerId !== translationLayerId) continue;
    const hid = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
    if (hid.length === 0 || seen.has(hid)) continue;
    seen.add(hid);
    out.push(hid);
  }
  return out;
}

/** 主宿主转写层 id；无 link 或无法解析时 undefined | Preferred host transcription id, if any */
export function getPreferredHostTranscriptionLayerIdForTranslation(
  translationLayerId: string,
  layerLinks: ReadonlyArray<TranslationHostLink>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
): string | undefined {
  const links = layerLinks.filter((l) => l.layerId === translationLayerId);
  if (links.length === 0) return undefined;
  const preferred = links.find((l) => l.isPreferred) ?? links[0];
  if (!preferred) return undefined;
  const id = resolveLayerLinkHostTranscriptionLayerId(preferred, transcriptionIdByKey);
  return id.length > 0 ? id : undefined;
}

/** 翻译宿主集合是否与给定转写 id 集合相交 | Whether any host of the translation hits the id set */
export function translationHostsIntersectTranscriptionIds(
  translationLayerId: string,
  transcriptionIdSet: ReadonlySet<string>,
  layerLinks: ReadonlyArray<TranslationHostLink>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
): boolean {
  if (transcriptionIdSet.size === 0) return false;
  for (const link of layerLinks) {
    if (link.layerId !== translationLayerId) continue;
    const hid = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
    if (hid.length > 0 && transcriptionIdSet.has(hid)) return true;
  }
  return false;
}
