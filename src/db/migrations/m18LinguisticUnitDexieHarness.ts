import Dexie, { type Table, type Transaction } from 'dexie';
import type { LayerUnitContentDocType, LayerUnitDocType, TierDefinitionDocType, UnitMorphemeDocType, UnitTokenDocType } from '../types';
import { upgradeM18LinguisticUnitCutover } from './m18LinguisticUnitCutover';

/**
 * Must match `JieyuDexie` v36/v37 `stores({ ... })` for these tables — update when engine changes.
 */
export const M18_PRE37_STORES = {
  tier_definitions: 'id, textId, key, parentTierId, tierType, contentType',
  units:
    'id, textId, mediaId, [textId+mediaId], [mediaId+startTime], [textId+startTime], startTime, updatedAt, speakerId',
  unit_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
  unit_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
  layer_units:
    'id, textId, mediaId, layerId, unitType, parentUnitId, rootUnitId, speakerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [parentUnitId+startTime], [layerId+unitType], [textId+layerId]',
  layer_unit_contents:
    'id, textId, unitId, layerId, contentRole, [unitId+contentRole], [contentRole+updatedAt], sourceType, [layerId+updatedAt], updatedAt',
} as const;

export const M18_V37_TOKEN_MORPH_STORES = {
  units: null,
  unit_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
  unit_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
} as const;

export function m18DexieIsolationName(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rnd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `jieyu-m18-${prefix}-${id}`;
}

/** Open at v36 only, seed fixtures, then close — used before attaching v37. */
export class M18DexieV36Seed extends Dexie {
  tier_definitions!: Table<TierDefinitionDocType, string>;
  units!: Table<LayerUnitDocType, string>;
  unit_tokens!: Table<UnitTokenDocType, string>;
  unit_morphemes!: Table<UnitMorphemeDocType, string>;
  layer_units!: Table<LayerUnitDocType, string>;
  layer_unit_contents!: Table<LayerUnitContentDocType, string>;

  constructor(name: string) {
    super(name);
    this.version(36).stores({ ...M18_PRE37_STORES });
  }
}

/** Same v36 schema + v37 upgrade hook as production `JieyuDexie`. */
export class M18DexieV36To37 extends Dexie {
  tier_definitions!: Table<TierDefinitionDocType, string>;
  unit_tokens!: Table<UnitTokenDocType, string>;
  unit_morphemes!: Table<UnitMorphemeDocType, string>;
  layer_units!: Table<LayerUnitDocType, string>;
  layer_unit_contents!: Table<LayerUnitContentDocType, string>;

  constructor(name: string) {
    super(name);
    this.version(36).stores({ ...M18_PRE37_STORES });
    this.version(37).stores({ ...M18_V37_TOKEN_MORPH_STORES }).upgrade(async (tx: Transaction) => {
      await upgradeM18LinguisticUnitCutover(tx);
    });
  }
}
