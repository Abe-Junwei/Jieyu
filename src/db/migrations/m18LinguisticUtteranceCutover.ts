/**
 * M18: merge legacy utterances into layer_units + layer_unit_contents, rename token/morpheme
 * utteranceId → unitId, then drop utterances store (Dexie v37).
 */
import type { Transaction } from 'dexie';
import type {
  LayerUnitDocType,
  TierDefinitionDocType,
  UtteranceDocType,
  UtteranceMorphemeDocType,
  UtteranceTokenDocType,
} from '../types';
import { mapUtteranceToLayerUnit } from './timelineUnitMapping';

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

/** Host id for a token/morpheme row before or after M18 field rename (v36: utteranceId; post: unitId). */
function linguisticSubgraphHostIdFromRow(row: Record<string, unknown>): string | undefined {
  if (typeof row.utteranceId === 'string' && row.utteranceId.trim().length > 0) {
    return row.utteranceId;
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
 * Ensures every subgraph host id will exist as an utterance-type `layer_unit` after the utterances merge.
 * Throws to fail the whole Dexie upgrade (no half-migrated subgraph with orphan unitIds).
 * Exported for unit tests.
 */
export function assertM18SubgraphHostsResolveToUtteranceLayerUnits(input: {
  subgraphReferencedUnitIds: ReadonlySet<string>;
  preExistingUtteranceLayerUnitIds: ReadonlySet<string>;
  migratedUtteranceIdsFromLegacyTable: ReadonlySet<string>;
}): void {
  const allowed = new Set([
    ...input.preExistingUtteranceLayerUnitIds,
    ...input.migratedUtteranceIdsFromLegacyTable,
  ]);
  for (const id of input.subgraphReferencedUnitIds) {
    if (!allowed.has(id)) {
      throw new Error(
        `M18 migration: utterance_tokens / utterance_morphemes reference host unit "${id}", `
        + 'but no utterance-type layer_units row exists for it after merging legacy utterances '
        + '(missing default transcription tier for that text, or stale token/morpheme rows). '
        + 'Fix tiers or remove orphan linguistic rows, then retry the upgrade.',
      );
    }
  }
}

export async function upgradeM18LinguisticUtteranceCutover(tx: Transaction): Promise<void> {
  const tiers = (await tx.table('tier_definitions').toArray()) as TierDefinitionDocType[];

  const utterancesTable = tx.table('utterances');
  const utterances = (await utterancesTable.toArray()) as UtteranceDocType[];
  const layerUnitsTable = tx.table('layer_units');
  const layerContentsTable = tx.table('layer_unit_contents');

  const layerUnitRows = (await layerUnitsTable.toArray()) as LayerUnitDocType[];
  const preExistingUtteranceLayerUnitIds = new Set(
    layerUnitRows.filter((unit) => unit.unitType === 'utterance').map((u) => u.id),
  );

  const tokensTable = tx.table('utterance_tokens');
  const morphemesTable = tx.table('utterance_morphemes');
  const tokenRows = await tokensTable.toArray();
  const morphRows = await morphemesTable.toArray();
  const subgraphReferencedUnitIds = collectM18SubgraphReferencedUnitIds(tokenRows, morphRows);

  const migratedUtteranceIdsFromLegacyTable = new Set<string>();
  for (const u of utterances) {
    const layerId = pickDefaultTranscriptionTierId(tiers, u.textId);
    if (!layerId) continue;
    const { unit, content } = mapUtteranceToLayerUnit(u, layerId);
    await layerUnitsTable.put(unit);
    await layerContentsTable.put(content);
    migratedUtteranceIdsFromLegacyTable.add(u.id);
  }

  assertM18SubgraphHostsResolveToUtteranceLayerUnits({
    subgraphReferencedUnitIds,
    preExistingUtteranceLayerUnitIds,
    migratedUtteranceIdsFromLegacyTable,
  });

  for (const raw of tokenRows) {
    const row = raw as Record<string, unknown>;
    const legacyId = row.utteranceId;
    if (typeof legacyId !== 'string') continue;
    const { utteranceId: _u, ...rest } = row;
    const next = { ...rest, unitId: legacyId } as UtteranceTokenDocType;
    await tokensTable.put(next);
  }

  for (const raw of morphRows) {
    const row = raw as Record<string, unknown>;
    const legacyId = row.utteranceId;
    if (typeof legacyId !== 'string') continue;
    const { utteranceId: _u, ...rest } = row;
    const next = { ...rest, unitId: legacyId } as UtteranceMorphemeDocType;
    await morphemesTable.put(next);
  }
}
