/**
 * 纵向对读壳宿主过滤工具函数 | Vertical paired-reading shell host filtering utilities
 *
 * 从 TranscriptionTimelineVerticalView.tsx 提取的纯函数，
 * 用于多宿主译文层在纵向对读壳内的过滤、匹配与选择。
 * Pure functions extracted from TranscriptionTimelineVerticalView.tsx
 * for multi-host translation layer filtering in the paired-reading shell.
 */

import type { LayerDocType } from '../db';
import type { VerticalReadingGroup } from './transcriptionVerticalReadingGroups';
import {
  buildTranscriptionIdByKeyMap,
  resolveLayerLinkHostTranscriptionLayerId,
  type TranslationHostLink,
} from './translationHostLinkQuery';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from './translationLayerTargetResolver';

export type VerticalReadingHostLink = TranslationHostLink;

/** 无 parent 的译文层在多转写项目中的回落宿主（默认转写或列表首层） | Orphan fallback host for translation layers */
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

export function translationLayerAppliesToVerticalReadingSourceTranscriptionIds(
  tl: LayerDocType,
  sourceTranscriptionIds: ReadonlySet<string>,
  transcriptionLayerCount: number,
  orphanAttachLayerId: string | undefined,
  linksByTranslationLayerId: ReadonlyMap<string, VerticalReadingHostLink[]>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
): boolean {
  // 译文宿主仅以 layer_links 为准，不读取 translation.parentLayerId | Translation host is link-only
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
  return sourceIds;
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
  const sourceIds = collectVerticalReadingGroupSourceTranscriptionLayerIds(group);
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
  const sourceIds = collectVerticalReadingGroupSourceTranscriptionLayerIds(group);
  if (sourceIds.size === 0) {
    const fallbackSourceLayerId = fallbackFocusedTranscriptionLayerId?.trim();
    if (fallbackSourceLayerId) sourceIds.add(fallbackSourceLayerId);
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
