import { layerTranscriptionTreeParentId, type LayerDocType, type LayerUnitDocType } from '../db';
import {
  buildTranscriptionIdByKeyMap,
  resolveLayerLinkHostTranscriptionLayerId,
  type TranslationHostLink,
} from './translationHostLinkQuery';

/** 入站 layer_links 解析出的宿主转写 id（首选 link 在前）；供纵向排序与读模型共用 | Resolved inbound host transcription ids */
export function listInboundTranscriptionHostIdsForTranscriptionLane(
  laneLayerId: string,
  layerLinks: ReadonlyArray<TranslationHostLink>,
  layerById: ReadonlyMap<string, LayerDocType>,
  transcriptionLaneIds: ReadonlySet<string>,
): string[] {
  if (layerLinks.length === 0) return [];
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap([...layerById.values()]);
  return resolveInboundHostTranscriptionIdsForLane(
    laneLayerId,
    layerLinks,
    transcriptionIdByKey,
    transcriptionLaneIds,
  );
}

function resolveInboundHostTranscriptionIdsForLane(
  laneLayerId: string,
  layerLinks: ReadonlyArray<TranslationHostLink>,
  transcriptionIdByKey: ReadonlyMap<string, string>,
  transcriptionLaneIds: ReadonlySet<string>,
): string[] {
  if (layerLinks.length === 0) return [];
  const lid = laneLayerId.trim();
  if (!lid) return [];
  const inbound = layerLinks.filter((link) => (link.layerId ?? '').trim() === lid);
  const ordered = [
    ...inbound.filter((link) => link.isPreferred),
    ...inbound.filter((link) => !link.isPreferred),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const link of ordered) {
    const hid = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey).trim();
    if (hid.length === 0 || hid === lid || !transcriptionLaneIds.has(hid) || seen.has(hid)) continue;
    seen.add(hid);
    out.push(hid);
  }
  return out;
}

/** Same primary-host rule as vertical paired-reading source walk | Aligns with `resolveVerticalReadingGroupSourceUnits`. */
export function resolvePrimaryUnscopedTranscriptionHostId(
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
): string {
  const defaultTr = (typeof defaultTranscriptionLayerId === 'string' && defaultTranscriptionLayerId.trim().length > 0
    ? defaultTranscriptionLayerId.trim()
    : '') || '';
  if (defaultTr && transcriptionLayers.some((l) => l.id === defaultTr)) return defaultTr;
  return transcriptionLayers[0]?.id ?? '';
}

/**
 * How a canonical timeline unit is attributed to a transcription lane row for **read / display**
 * (paired-reading source walk, lane-scoped UI). Not for persistence or write routing.
 */
export type TranscriptionLaneCanonicalRowResolution =
  | 'explicit_unit_layer'
  | 'explicit_tree_parent_layer'
  | 'unscoped_default_host'
  | 'unscoped_descendant_of_default_host';

/**
 * Narrow read-model view: one canonical unit projected onto one transcription lane row.
 * `row.layerId` may be **stamped** for UI / paired-reading alignment; persistence and write routing must still use
 * explicit segment or layer actions — see ADR 0020.
 */
export type LaneScopedUnitView = Readonly<{
  row: LayerUnitDocType;
  resolution: TranscriptionLaneCanonicalRowResolution;
}>;

export type ResolveCanonicalUnitForTranscriptionLaneResult =
  | Readonly<{ include: false }>
  | Readonly<{ include: true } & LaneScopedUnitView>;

export type ResolveCanonicalUnitForTranscriptionLaneInput = {
  unit: LayerUnitDocType;
  laneLayer: LayerDocType;
  layerById: ReadonlyMap<string, LayerDocType>;
  transcriptionLaneIds: ReadonlySet<string>;
  primaryUnscopedHostId: string;
  /** 入站宿主 link（`link.layerId` 为子层）；无 `parentLayerId` 的独立边界依赖轨靠此与宿主对齐读模型 | Inbound host links when tree parent is absent */
  layerLinks?: ReadonlyArray<TranslationHostLink>;
};

/**
 * Whether unscoped canonical units (read model often omits `layerId`) should appear on this lane.
 * True for the default host lane and any lane that can reach it via `parentLayerId` and/or inbound `layer_links`
 * host transcription ids (independent-boundary dependents often omit `parentLayerId`).
 */
export function transcriptionLaneAcceptsUnscopedCanonicalUnits(input: {
  laneLayer: LayerDocType;
  layerById: ReadonlyMap<string, LayerDocType>;
  transcriptionLaneIds: ReadonlySet<string>;
  primaryUnscopedHostId: string;
  layerLinks?: ReadonlyArray<TranslationHostLink>;
}): boolean {
  const { laneLayer, layerById, transcriptionLaneIds, primaryUnscopedHostId } = input;
  const primary = primaryUnscopedHostId.trim();
  if (!primary) return false;
  if (laneLayer.id === primary) return true;
  const links = input.layerLinks ?? [];

  let cur: LayerDocType | undefined = layerById.get(laneLayer.id);
  const guard = new Set<string>();
  for (let i = 0; i < 64 && cur; i += 1) {
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    const p = layerTranscriptionTreeParentId(cur)?.trim() ?? '';
    if (p && transcriptionLaneIds.has(p)) {
      if (p === primary) return true;
      cur = layerById.get(p);
      continue;
    }
    const hostCandidates = links.length > 0
      ? listInboundTranscriptionHostIdsForTranscriptionLane(cur.id, links, layerById, transcriptionLaneIds)
      : [];
    let stepped = false;
    for (const hid of hostCandidates) {
      if (hid === primary) return true;
      const next = layerById.get(hid);
      if (next) {
        cur = next;
        stepped = true;
        break;
      }
    }
    if (stepped) continue;
    break;
  }
  return false;
}

/**
 * Single entry for: should this canonical `unit` contribute a row on `laneLayer`, and with what stamped `layerId`?
 * Call sites that partition units by lane **must** use this (or wrappers) for unscoped canonical rows — do not
 * reimplement `if (!unit.layerId)` against `laneLayer.id` only.
 */
export function resolveCanonicalUnitForTranscriptionLaneRow(
  input: ResolveCanonicalUnitForTranscriptionLaneInput,
): ResolveCanonicalUnitForTranscriptionLaneResult {
  const { unit, laneLayer, layerById, transcriptionLaneIds, primaryUnscopedHostId } = input;
  if (unit.tags?.skipProcessing === true) return { include: false };
  const lid = typeof unit.layerId === 'string' ? unit.layerId.trim() : '';
  const links = input.layerLinks ?? [];
  const treeParentId = layerTranscriptionTreeParentId(laneLayer)?.trim() ?? '';
  const linkHostIds = links.length > 0
    ? listInboundTranscriptionHostIdsForTranscriptionLane(laneLayer.id, links, layerById, transcriptionLaneIds)
    : [];
  const matchesLane = lid.length > 0 && lid === laneLayer.id;
  const matchesTreeParent = treeParentId.length > 0 && transcriptionLaneIds.has(treeParentId) && lid === treeParentId;
  const matchesLinkHostLayer = linkHostIds.some((hid) => lid === hid);
  const matchesHostTranscriptionLayer = matchesTreeParent || matchesLinkHostLayer;
  const unscoped = lid.length === 0;
  const unscopedInherits =
    unscoped &&
    transcriptionLaneAcceptsUnscopedCanonicalUnits({
      laneLayer,
      layerById,
      transcriptionLaneIds,
      primaryUnscopedHostId,
      ...(links.length > 0 ? { layerLinks: links } : {}),
    });
  if (!unscoped && !matchesLane && !matchesHostTranscriptionLayer) return { include: false };
  if (unscoped && !unscopedInherits) return { include: false };

  let resolution: TranscriptionLaneCanonicalRowResolution;
  if (matchesLane) resolution = 'explicit_unit_layer';
  else if (matchesHostTranscriptionLayer) resolution = 'explicit_tree_parent_layer';
  else if (laneLayer.id === primaryUnscopedHostId) resolution = 'unscoped_default_host';
  else resolution = 'unscoped_descendant_of_default_host';

  const row: LayerUnitDocType = matchesLane ? unit : { ...unit, layerId: laneLayer.id };
  const view: LaneScopedUnitView = { row, resolution };
  return { include: true, ...view };
}
