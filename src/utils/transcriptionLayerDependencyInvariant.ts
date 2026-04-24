import { layerTranscriptionTreeParentId, type LayerDocType, type LayerLinkDocType } from '../db';
import { listInboundTranscriptionHostIdsForTranscriptionLane } from './transcriptionUnitLaneReadScope';

export type TranscriptionDependencyInvariantViolation = Readonly<{
  layerId: string;
  layerKey: string;
  constraint: 'symbolic_association' | 'time_subdivision';
}>;

/** 将 layer_links 限制为至少一端落在给定层 id 集合内，避免跨文本噪声 | Keep links touching the in-scope layer id set */
export function scopeLayerLinksToLayerIdSet(
  layerLinks: readonly LayerLinkDocType[],
  layerIds: ReadonlySet<string>,
): LayerLinkDocType[] {
  return layerLinks.filter((link) => {
    const lid = (link.layerId ?? '').trim();
    const hid = (link.hostTranscriptionLayerId ?? '').trim();
    return (lid.length > 0 && layerIds.has(lid)) || (hid.length > 0 && layerIds.has(hid));
  });
}

/**
 * 依赖型转写层（symbolic_association / time_subdivision）必须能解析宿主：
 * - `parentLayerId` 指向同一作用域内已存在的转写层，或
 * - 存在入站 `layer_links`（`layerId` 为本层）且解析出的宿主转写 id 落在作用域内。
 * 不含 `constraint` 或为 `independent_boundary` 的层不校验（独立边界轨另有语义）。
 */
export function findTranscriptionDependencyInvariantViolations(input: {
  layers: readonly LayerDocType[];
  layerLinks: readonly LayerLinkDocType[];
}): TranscriptionDependencyInvariantViolation[] {
  const layerById = new Map(input.layers.map((l) => [l.id, l] as const));
  const transcriptionLaneIds = new Set(
    input.layers.filter((l) => l.layerType === 'transcription').map((l) => l.id),
  );

  const violations: TranscriptionDependencyInvariantViolation[] = [];

  for (const layer of input.layers) {
    if (layer.layerType !== 'transcription') continue;
    const c = layer.constraint;
    if (c !== 'symbolic_association' && c !== 'time_subdivision') continue;

    const treeParentId = (layerTranscriptionTreeParentId(layer) ?? '').trim();
    const parentResolves =
      treeParentId.length > 0 &&
      transcriptionLaneIds.has(treeParentId) &&
      layerById.get(treeParentId)?.layerType === 'transcription';

    const linkHosts = listInboundTranscriptionHostIdsForTranscriptionLane(
      layer.id,
      input.layerLinks,
      layerById,
      transcriptionLaneIds,
    );
    const hostViaLink = linkHosts.length > 0;

    if (!parentResolves && !hostViaLink) {
      violations.push({
        layerId: layer.id,
        layerKey: typeof layer.key === 'string' && layer.key.trim().length > 0 ? layer.key.trim() : layer.id,
        constraint: c,
      });
    }
  }

  return violations;
}

export function assertTranscriptionDependencyLayerInvariant(input: {
  layers: readonly LayerDocType[];
  layerLinks: readonly LayerLinkDocType[];
}): void {
  const violations = findTranscriptionDependencyInvariantViolations(input);
  if (violations.length === 0) return;
  const detail = violations.map((v) => `${v.layerKey}(${v.constraint})`).join('; ');
  throw new Error(
    `[transcription-dependency-invariant] Dependent transcription layers (symbolic_association | time_subdivision) must have parentLayerId pointing to an in-scope transcription layer or inbound layer_links to a host. Offending: ${detail}`,
  );
}
