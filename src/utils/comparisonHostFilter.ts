/**
 * 对照视图宿主过滤工具函数 | Comparison view host filtering utilities
 *
 * 从 TranscriptionTimelineComparison.tsx 提取的纯函数，
 * 用于多宿主译文层在对照视图中的过滤、匹配与选择。
 * Pure functions extracted from TranscriptionTimelineComparison.tsx
 * for multi-host translation layer filtering in comparison view.
 */

import type { LayerDocType } from '../db';
import type { ComparisonGroup } from './transcriptionComparisonGroups';
import {
  buildTranscriptionIdByKeyMap,
  resolveLayerLinkHostTranscriptionLayerId,
  type TranslationHostLink,
} from './translationHostLinkQuery';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from './translationLayerTargetResolver';

export type ComparisonHostLink = TranslationHostLink;

/** 无 parent 的译文层在多转写项目中的回落宿主（默认转写或列表首层） | Orphan fallback host for translation layers */
export function resolveOrphanTranslationAttachTranscriptionLayerId(
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
): string | undefined {
  const d = defaultTranscriptionLayerId?.trim();
  if (d && transcriptionLayers.some((l) => l.id === d)) return d;
  return transcriptionLayers[0]?.id;
}

export function buildComparisonHostLinkMaps(
  transcriptionLayers: readonly LayerDocType[],
  layerLinks: readonly ComparisonHostLink[],
): {
  transcriptionIdByKey: Map<string, string>;
  linksByTranslationLayerId: Map<string, ComparisonHostLink[]>;
} {
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap(transcriptionLayers);

  const linksByTranslationLayerId = new Map<string, ComparisonHostLink[]>();
  for (const link of layerLinks) {
    const items = linksByTranslationLayerId.get(link.layerId) ?? [];
    items.push(link);
    linksByTranslationLayerId.set(link.layerId, items);
  }

  return { transcriptionIdByKey, linksByTranslationLayerId };
}

export function translationLayerAppliesToComparisonSourceTranscriptionIds(
  tl: LayerDocType,
  sourceTranscriptionIds: ReadonlySet<string>,
  transcriptionLayerCount: number,
  orphanAttachLayerId: string | undefined,
  linksByTranslationLayerId: ReadonlyMap<string, ComparisonHostLink[]>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
): boolean {
  const parent = tl.parentLayerId?.trim() ?? '';
  if (parent.length > 0) {
    if (sourceTranscriptionIds.size === 0) return false;
    return sourceTranscriptionIds.has(parent);
  }
  const links = linksByTranslationLayerId.get(tl.id) ?? [];
  if (links.length > 0) {
    if (sourceTranscriptionIds.size === 0) return false;
    return links.some((link) => {
      const hostId = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
      return hostId.length > 0 && sourceTranscriptionIds.has(hostId);
    });
  }
  if (transcriptionLayerCount <= 1) return true;
  if (!orphanAttachLayerId) return false;
  return sourceTranscriptionIds.has(orphanAttachLayerId);
}

export function collectComparisonGroupSourceTranscriptionLayerIds(
  group: ComparisonGroup,
  fallbackTranscriptionLayerId: string | undefined,
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
  if (sourceIds.size === 0 && fallbackTranscriptionLayerId?.trim()) {
    sourceIds.add(fallbackTranscriptionLayerId.trim());
  }
  return sourceIds;
}

export function filterTranslationLayersForComparisonGroup(
  group: ComparisonGroup,
  translationLayers: readonly LayerDocType[],
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  fallbackFocusedTranscriptionLayerId: string | undefined,
  layerLinks: readonly ComparisonHostLink[] = [],
): LayerDocType[] {
  const transcriptionLayerCount = transcriptionLayers.length;
  const { transcriptionIdByKey, linksByTranslationLayerId } = buildComparisonHostLinkMaps(
    transcriptionLayers,
    layerLinks,
  );
  const orphanAttach = resolveOrphanTranslationAttachTranscriptionLayerId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );
  const fb = fallbackFocusedTranscriptionLayerId?.trim()
    ?? resolveOrphanTranslationAttachTranscriptionLayerId(transcriptionLayers, defaultTranscriptionLayerId);
  const sourceIds = collectComparisonGroupSourceTranscriptionLayerIds(group, fb);
  return translationLayers.filter((tl) => translationLayerAppliesToComparisonSourceTranscriptionIds(
    tl,
    sourceIds,
    transcriptionLayerCount,
    orphanAttach,
    linksByTranslationLayerId,
    transcriptionIdByKey,
  ));
}

export function resolveComparisonGroupEmptyReason(
  group: ComparisonGroup,
  translationLayers: readonly LayerDocType[],
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  fallbackFocusedTranscriptionLayerId: string | undefined,
  layerLinks: readonly ComparisonHostLink[] = [],
): 'no-child' | 'orphan-needs-repair' {
  if (translationLayers.length === 0) return 'no-child';
  if (transcriptionLayers.length <= 1) return 'no-child';
  const { transcriptionIdByKey, linksByTranslationLayerId } = buildComparisonHostLinkMaps(
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
  const fallbackSourceLayerId = fallbackFocusedTranscriptionLayerId?.trim()
    ?? resolveOrphanTranslationAttachTranscriptionLayerId(transcriptionLayers, defaultTranscriptionLayerId);
  const sourceIds = collectComparisonGroupSourceTranscriptionLayerIds(group, fallbackSourceLayerId);
  return sourceIds.has(orphanAttachLayerId) ? 'no-child' : 'orphan-needs-repair';
}

export function pickTranslationLayerForComparisonUnit(
  unit: { layerId?: string | undefined; id: string },
  allTranslationLayers: readonly LayerDocType[],
  preferred: LayerDocType | undefined,
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  layerLinks: readonly ComparisonHostLink[] = [],
): LayerDocType | undefined {
  if (allTranslationLayers.length === 0) return undefined;
  const transcriptionLayerCount = transcriptionLayers.length;
  const { transcriptionIdByKey, linksByTranslationLayerId } = buildComparisonHostLinkMaps(
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
  const candidates = allTranslationLayers.filter((tl) => translationLayerAppliesToComparisonSourceTranscriptionIds(
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
