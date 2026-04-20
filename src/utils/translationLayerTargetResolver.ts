import type { LayerDocType, LayerLinkDocType } from '../db';
import {
  buildTranscriptionIdByKeyMap,
  resolveLayerLinkHostTranscriptionLayerId,
} from './translationHostLinkQuery';

type HostAwareLayerLink = Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>;

/** 解析「当前应落到哪条译文层」时的输入；字段用 null 表示显式空值以兼容 exactOptionalPropertyTypes。 */
export interface ResolveHostAwareTranslationLayerIdInput {
  selectedLayerId?: string | null;
  selectedUnitLayerId?: string | null;
  defaultTranscriptionLayerId?: string | null;
  allowFirstTranslationFallback?: boolean;
  translationLayers: ReadonlyArray<LayerDocType>;
  layerLinks?: ReadonlyArray<HostAwareLayerLink>;
  transcriptionLayers?: ReadonlyArray<LayerDocType>;
}

/** 从各处 UI/snapshot 的松散字段归一化后解析译文层 id（单入口，避免重复 ?? null 与漏传）。 */
export function resolveHostAwareTranslationLayerIdFromSnapshot(
  input: {
    selectedLayerId?: string | null | undefined;
    selectedUnitLayerId?: string | null | undefined;
    defaultTranscriptionLayerId?: string | null | undefined;
    allowFirstTranslationFallback?: boolean;
    translationLayers: ReadonlyArray<LayerDocType>;
    layerLinks?: ReadonlyArray<HostAwareLayerLink>;
    transcriptionLayers?: ReadonlyArray<LayerDocType>;
  },
): string | undefined {
  return resolveHostAwareTranslationLayerId({
    selectedLayerId: input.selectedLayerId ?? null,
    selectedUnitLayerId: input.selectedUnitLayerId ?? null,
    defaultTranscriptionLayerId: input.defaultTranscriptionLayerId ?? null,
    translationLayers: input.translationLayers,
    ...(input.allowFirstTranslationFallback !== undefined ? { allowFirstTranslationFallback: input.allowFirstTranslationFallback } : {}),
    ...(input.layerLinks !== undefined ? { layerLinks: input.layerLinks } : {}),
    ...(input.transcriptionLayers !== undefined ? { transcriptionLayers: input.transcriptionLayers } : {}),
  });
}

function normalizeLayerId(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function resolveHostAwareTranslationLayerId(
  input: ResolveHostAwareTranslationLayerIdInput,
): string | undefined {
  if (input.translationLayers.length === 0) return undefined;

  const transcriptionIdByKey = buildTranscriptionIdByKeyMap(input.transcriptionLayers);
  const layerLinksByTranslationId = new Map<string, HostAwareLayerLink[]>();
  for (const link of input.layerLinks ?? []) {
    const items = layerLinksByTranslationId.get(link.layerId) ?? [];
    items.push(link);
    layerLinksByTranslationId.set(link.layerId, items);
  }

  const translationIdSet = new Set(input.translationLayers.map((layer) => layer.id));
  const preferredDirectIds = [
    normalizeLayerId(input.selectedLayerId),
    normalizeLayerId(input.selectedUnitLayerId),
  ];
  for (const preferredId of preferredDirectIds) {
    if (preferredId.length > 0 && translationIdSet.has(preferredId)) {
      return preferredId;
    }
  }

  const hostCandidates = [
    normalizeLayerId(input.selectedUnitLayerId),
    normalizeLayerId(input.selectedLayerId),
    normalizeLayerId(input.defaultTranscriptionLayerId),
  ];
  const seenHostIds = new Set<string>();
  for (const hostLayerId of hostCandidates) {
    if (hostLayerId.length === 0 || seenHostIds.has(hostLayerId)) continue;
    seenHostIds.add(hostLayerId);

    let matchedFromLinks: string | undefined;
    for (const layer of input.translationLayers) {
      const links = layerLinksByTranslationId.get(layer.id) ?? [];
      if (links.length === 0) continue;
      const matchesSelectedHost = links.some((link) => {
        const resolvedHostId = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
        return resolvedHostId === hostLayerId;
      });
      if (matchesSelectedHost) {
        matchedFromLinks = layer.id;
        break;
      }
    }
    if (matchedFromLinks) return matchedFromLinks;
  }

  if (input.allowFirstTranslationFallback === false) return undefined;
  return input.translationLayers[0]?.id;
}
