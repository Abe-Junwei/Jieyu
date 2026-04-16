/**
 * M18: merge legacy units into layer_units + layer_unit_contents, rename token/morpheme
 * unitId → unitId, then drop units store (Dexie v37).
 */
import type { Transaction } from 'dexie';
import type { LayerUnitDocType, TierDefinitionDocType, UnitMorphemeDocType, UnitTokenDocType } from '../types';
import { mapUnitToLayerUnit } from './timelineUnitMapping';

function pickDefaultTranscriptionTierId(
  tiers: readonly TierDefinitionDocType[],
  textId: string,
): string | undefined {
  const MAX = Number.MAX_SAFE_INTEGER;
  const candidates = tiers.filter((t) => t.textId === textId && t.contentType === 'transcription');
  if (candidates.length === 0) {
    return tiers.find((t) => t.textId === textId)?.id;
  }
  const def = candidates.find((t) => t.isDefault === true);
  if (def) return def.id;
  return [...candidates].sort((a, b) => (a.sortOrder ?? MAX) - (b.sortOrder ?? MAX))[0]?.id;
}

/** Host id for a token/morpheme row before or after M18 field rename (v36: unitId; post: unitId). */
function linguisticSubgraphHostIdFromRow(row: Record<string, unknown>): string | undefined {
  if (typeof row.unitId === 'string' && row.unitId.trim().length > 0) {
    return row.unitId;
  }
  if (typeof row.unitId === 'string' && row.unitId.trim().length > 0) {
    return row.unitId;
  }
  return undefined;
}

/**
 * Collects unit ids referenced by linguistic subgraph rows (tokens + morphemes).
 * Exported for unit tests.
 */
export function collectM18SubgraphReferencedUnitIds(
  tokenRows: unknown[],
  morphRows: unknown[],
): Set<string> {
  const refs = new Set<string>();
  for (const raw of tokenRows) {
    const id = linguisticSubgraphHostIdFromRow(raw as Record<string, unknown>);
    if (id) refs.add(id);
  }
  for (const raw of morphRows) {
    const id = linguisticSubgraphHostIdFromRow(raw as Record<string, unknown>);
    if (id) refs.add(id);
  }
  return refs;
}

/**
 * Ensures every subgraph host id will exist as an unit-type `layer_unit` after the units merge.
 * Throws to fail the whole Dexie upgrade (no half-migrated subgraph with orphan unitIds).
 * Exported for unit tests.
 */
export function assertM18SubgraphHostsResolveToUnitLayerUnits(input: {
  subgraphReferencedUnitIds: ReadonlySet<string>;
  preExistingUnitLayerUnitIds: ReadonlySet<string>;
  migratedUnitIdsFromLegacyTable: ReadonlySet<string>;
}): void {
  const allowed = new Set([
    ...input.preExistingUnitLayerUnitIds,
    ...input.migratedUnitIdsFromLegacyTable,
  ]);
  for (const id of input.subgraphReferencedUnitIds) {
    if (!allowed.has(id)) {
      throw new Error(
        `M18 migration: unit_tokens / unit_morphemes reference host unit "${id}", `
        + 'but no unit-type layer_units row exists for it after merging legacy units '
        + '(missing default transcription tier for that text, or stale token/morpheme rows). '
        + 'Fix tiers or remove orphan linguistic rows, then retry the upgrade.',
      );
    }
  }
}

export async function upgradeM18LinguisticUnitCutover(tx: Transaction): Promise<void> {
  const tiers = (await tx.table('tier_definitions').toArray()) as TierDefinitionDocType[];

  const unitsTable = tx.table('units');
  const units = (await unitsTable.toArray()) as LayerUnitDocType[];
  const layerUnitsTable = tx.table('layer_units');
  const layerContentsTable = tx.table('layer_unit_contents');

  const layerUnitRows = (await layerUnitsTable.toArray()) as LayerUnitDocType[];
  const preExistingUnitLayerUnitIds = new Set(
    layerUnitRows.filter((unit) => unit.unitType === 'unit').map((u) => u.id),
  );

  const tokensTable = tx.table('unit_tokens');
  const morphemesTable = tx.table('unit_morphemes');
  const tokenRows = await tokensTable.toArray();
  const morphRows = await morphemesTable.toArray();
  const subgraphReferencedUnitIds = collectM18SubgraphReferencedUnitIds(tokenRows, morphRows);

  const migratedUnitIdsFromLegacyTable = new Set<string>();
  for (const u of units) {
    const layerId = pickDefaultTranscriptionTierId(tiers, u.textId);
    if (!layerId) continue;
    const { unit, content } = mapUnitToLayerUnit(u, layerId);
    await layerUnitsTable.put(unit);
    await layerContentsTable.put(content);
    migratedUnitIdsFromLegacyTable.add(u.id);
  }

  assertM18SubgraphHostsResolveToUnitLayerUnits({
    subgraphReferencedUnitIds,
    preExistingUnitLayerUnitIds,
    migratedUnitIdsFromLegacyTable,
  });

  for (const raw of tokenRows) {
    const row = raw as Record<string, unknown>;
    const legacyId = row.unitId;
    if (typeof legacyId !== 'string') continue;
    const { unitId: _u, ...rest } = row;
    const next = { ...rest, unitId: legacyId } as UnitTokenDocType;
    await tokensTable.put(next);
  }

  for (const raw of morphRows) {
    const row = raw as Record<string, unknown>;
    const legacyId = row.unitId;
    if (typeof legacyId !== 'string') continue;
    const { unitId: _u, ...rest } = row;
    const next = { ...rest, unitId: legacyId } as UnitMorphemeDocType;
    await morphemesTable.put(next);
  }
}
