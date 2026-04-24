/**
 * 纵向对读壳宿主过滤工具函数 | Vertical paired-reading shell host filtering utilities
 *
 * 从 TranscriptionTimelineVerticalView.tsx 提取的纯函数，
 * 用于多宿主翻译层在纵向对读壳内的过滤、匹配与选择。
 * Pure functions extracted from TranscriptionTimelineVerticalView.tsx
 * for multi-host translation layer filtering in the paired-reading shell.
 */

import { layerTranscriptionTreeParentId, type LayerDocType, type LayerUnitDocType } from '../db';
import type { VerticalReadingGroup } from './transcriptionVerticalReadingGroups';
import {
  buildTranscriptionIdByKeyMap,
  resolveLayerLinkHostTranscriptionLayerId,
  type TranslationHostLink,
} from './translationHostLinkQuery';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from './translationLayerTargetResolver';

export type VerticalReadingHostLink = TranslationHostLink;

/** 无 parent 的翻译层在多转写项目中的回落宿主（默认转写或列表首层） | Orphan fallback host for translation layers */
export function resolveOrphanTranslationAttachTranscriptionLayerId(
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
): string | undefined {
  const d = defaultTranscriptionLayerId?.trim();
  if (d && transcriptionLayers.some((l) => l.id === d)) return d;
  return transcriptionLayers[0]?.id;
}

export function buildVerticalReadingHostLinkMaps(
  transcriptionLayers: readonly LayerDocType[],
  layerLinks: readonly VerticalReadingHostLink[],
): {
  transcriptionIdByKey: Map<string, string>;
  linksByTranslationLayerId: Map<string, VerticalReadingHostLink[]>;
} {
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap(transcriptionLayers);

  const linksByTranslationLayerId = new Map<string, VerticalReadingHostLink[]>();
  for (const link of layerLinks) {
    const items = linksByTranslationLayerId.get(link.layerId) ?? [];
    items.push(link);
    linksByTranslationLayerId.set(link.layerId, items);
  }

  return { transcriptionIdByKey, linksByTranslationLayerId };
}

/** 依赖转写轨上的源行 layerId 为子层时，仍应匹配挂在父独立轨上的译文宿主 link | Dependent lane rows inherit parent host for translation filter */
function expandTranscriptionSourceIdsWithTreeParents(
  seed: ReadonlySet<string>,
  transcriptionLayers: readonly LayerDocType[],
): Set<string> {
  const next = new Set<string>();
  for (const raw of seed) {
    const id = raw.trim();
    if (id) next.add(id);
  }
  if (!transcriptionLayers.length) return next;

  const laneIds = new Set(transcriptionLayers.map((l) => l.id));
  const layerById = new Map(transcriptionLayers.map((l) => [l.id, l] as const));
  const expanded = new Set<string>();
  for (const rawId of next) {
    expanded.add(rawId);
    let cur: LayerDocType | undefined = layerById.get(rawId);
    const guard = new Set<string>();
    for (let i = 0; i < 64 && cur && cur.layerType === 'transcription'; i += 1) {
      if (guard.has(cur.id)) break;
      guard.add(cur.id);
      const p = layerTranscriptionTreeParentId(cur)?.trim() ?? '';
      if (!p || !laneIds.has(p)) break;
      expanded.add(p);
      cur = layerById.get(p);
    }
  }
  return expanded;
}

export function translationLayerAppliesToVerticalReadingSourceTranscriptionIds(
  tl: LayerDocType,
  sourceTranscriptionIds: ReadonlySet<string>,
  transcriptionLayerCount: number,
  orphanAttachLayerId: string | undefined,
  linksByTranslationLayerId: ReadonlyMap<string, VerticalReadingHostLink[]>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
): boolean {
  // 翻译宿主仅以 layer_links 为准，不读取 translation.parentLayerId | Translation host is link-only
  const links = linksByTranslationLayerId.get(tl.id) ?? [];
  if (links.length > 0) {
    if (sourceTranscriptionIds.size === 0) return transcriptionLayerCount <= 1;
    const matched = links.some((link) => {
      const hostId = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
      return hostId.length > 0 && sourceTranscriptionIds.has(hostId);
    });
    if (matched) return true;
    if (transcriptionLayerCount <= 1) {
      const hasResolvableHost = links.some(
        (link) => resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey).length > 0,
      );
      if (!hasResolvableHost) return true;
    }
    return false;
  }
  if (transcriptionLayerCount <= 1) return true;
  if (!orphanAttachLayerId) return false;
  return sourceTranscriptionIds.has(orphanAttachLayerId);
}

export function collectVerticalReadingGroupSourceTranscriptionLayerIds(
  group: VerticalReadingGroup,
  transcriptionLayers?: readonly LayerDocType[],
): Set<string> {
  const sourceIds = new Set<string>();
  for (const si of group.sourceItems) {
    const id = si.layerId?.trim();
    if (id) sourceIds.add(id);
  }
  if (sourceIds.size === 0) {
    const primary = group.primaryAnchorLayerId?.trim();
    if (primary) sourceIds.add(primary);
  }
  return expandTranscriptionSourceIdsWithTreeParents(sourceIds, transcriptionLayers ?? []);
}

/**
 * 与 `filterTranslationLayersForVerticalReadingGroup` 同源，但以**单条源单位**为宿主范围
 *（用于 `buildVerticalReadingGroups` 聚合多译文层，与横向「对当前转写行可见的译文层」一致）。 |
 * Same host filter as paired-reading groups, scoped to one source unit for aggregate target modeling.
 */
export function filterTranslationLayersForVerticalReadingSourceUnit(
  unit: Pick<LayerUnitDocType, 'id' | 'startTime' | 'endTime' | 'layerId'>,
  translationLayers: readonly LayerDocType[],
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  fallbackFocusedTranscriptionLayerId: string | undefined,
  layerLinks: readonly VerticalReadingHostLink[] = [],
): LayerDocType[] {
  const layerId = typeof unit.layerId === 'string' ? unit.layerId.trim() : '';
  const synthetic: VerticalReadingGroup = {
    id: `__paired-reading-scope:${unit.id}`,
    startTime: unit.startTime,
    endTime: unit.endTime,
    sourceItems: [{
      unitId: unit.id,
      text: '',
      startTime: unit.startTime,
      endTime: unit.endTime,
      ...(layerId.length > 0 ? { layerId } : {}),
    }],
    targetItems: [],
    speakerSummary: '',
    primaryAnchorUnitId: unit.id,
    ...(layerId.length > 0 ? { primaryAnchorLayerId: layerId } : {}),
    editingTargetPolicy: 'group-target',
    isMultiAnchorGroup: false,
  };
  return filterTranslationLayersForVerticalReadingGroup(
    synthetic,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    fallbackFocusedTranscriptionLayerId,
    layerLinks,
  );
}

export function filterTranslationLayersForVerticalReadingGroup(
  group: VerticalReadingGroup,
  translationLayers: readonly LayerDocType[],
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  fallbackFocusedTranscriptionLayerId: string | undefined,
  layerLinks: readonly VerticalReadingHostLink[] = [],
): LayerDocType[] {
  const transcriptionLayerCount = transcriptionLayers.length;
  const { transcriptionIdByKey, linksByTranslationLayerId } = buildVerticalReadingHostLinkMaps(
    transcriptionLayers,
    layerLinks,
  );
  const orphanAttach = resolveOrphanTranslationAttachTranscriptionLayerId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );
  const sourceIds = collectVerticalReadingGroupSourceTranscriptionLayerIds(group, transcriptionLayers);
  if (sourceIds.size === 0) {
    return [...translationLayers];
  }
  return translationLayers.filter((tl) => translationLayerAppliesToVerticalReadingSourceTranscriptionIds(
    tl,
    sourceIds,
    transcriptionLayerCount,
    orphanAttach,
    linksByTranslationLayerId,
    transcriptionIdByKey,
  ));
}

export function resolveVerticalReadingGroupEmptyReason(
  group: VerticalReadingGroup,
  translationLayers: readonly LayerDocType[],
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  fallbackFocusedTranscriptionLayerId: string | undefined,
  layerLinks: readonly VerticalReadingHostLink[] = [],
): 'no-child' | 'orphan-needs-repair' {
  if (translationLayers.length === 0) return 'no-child';
  if (transcriptionLayers.length <= 1) return 'no-child';
  const { transcriptionIdByKey, linksByTranslationLayerId } = buildVerticalReadingHostLinkMaps(
    transcriptionLayers,
    layerLinks,
  );
  const hasOrphanLayer = translationLayers.some((layer) => {
    const links = linksByTranslationLayerId.get(layer.id) ?? [];
    if (links.length > 0) {
      const hasHost = links.some((link) => resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey).length > 0);
      return !hasHost;
    }
    return true;
  });
  if (!hasOrphanLayer) return 'no-child';
  const orphanAttachLayerId = resolveOrphanTranslationAttachTranscriptionLayerId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );
  if (!orphanAttachLayerId) return 'no-child';
  let sourceIds = collectVerticalReadingGroupSourceTranscriptionLayerIds(group, transcriptionLayers);
  if (sourceIds.size === 0) {
    const fallbackSourceLayerId = fallbackFocusedTranscriptionLayerId?.trim();
    if (fallbackSourceLayerId) {
      sourceIds = expandTranscriptionSourceIdsWithTreeParents(new Set([fallbackSourceLayerId]), transcriptionLayers);
    }
  }
  if (sourceIds.size === 0) return 'no-child';
  return sourceIds.has(orphanAttachLayerId) ? 'no-child' : 'orphan-needs-repair';
}

export function pickTranslationLayerForVerticalReadingUnit(
  unit: { layerId?: string | undefined; id: string },
  allTranslationLayers: readonly LayerDocType[],
  preferred: LayerDocType | undefined,
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  layerLinks: readonly VerticalReadingHostLink[] = [],
): LayerDocType | undefined {
  if (allTranslationLayers.length === 0) return undefined;
  const transcriptionLayerCount = transcriptionLayers.length;
  const { transcriptionIdByKey, linksByTranslationLayerId } = buildVerticalReadingHostLinkMaps(
    transcriptionLayers,
    layerLinks,
  );
  const unitSourceId = typeof unit.layerId === 'string' ? unit.layerId.trim() : '';
  if (!unitSourceId && transcriptionLayerCount > 1) {
    return preferred ?? allTranslationLayers[0];
  }
  const orphanAttach = resolveOrphanTranslationAttachTranscriptionLayerId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );
  const sourceIds = new Set(unitSourceId ? [unitSourceId] : []);
  const candidates = allTranslationLayers.filter((tl) => translationLayerAppliesToVerticalReadingSourceTranscriptionIds(
    tl,
    sourceIds,
    transcriptionLayerCount,
    orphanAttach,
    linksByTranslationLayerId,
    transcriptionIdByKey,
  ));
  if (candidates.length === 0) {
    if (transcriptionLayerCount <= 1) return preferred ?? allTranslationLayers[0];
    if (!unitSourceId) return preferred ?? allTranslationLayers[0];
    return undefined;
  }
  const preferredTranslationId = preferred?.layerType === 'translation' ? preferred.id : undefined;
  const resolvedId = resolveHostAwareTranslationLayerIdFromSnapshot({
    selectedLayerId: preferredTranslationId,
    selectedUnitLayerId: unitSourceId || null,
    defaultTranscriptionLayerId: defaultTranscriptionLayerId ?? null,
    translationLayers: candidates,
    transcriptionLayers,
    layerLinks,
  });
  if (!resolvedId) return candidates[0];
  return candidates.find((c) => c.id === resolvedId) ?? candidates[0];
}
