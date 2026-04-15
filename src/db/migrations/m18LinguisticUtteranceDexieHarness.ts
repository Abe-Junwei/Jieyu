import Dexie, { type Table, type Transaction } from 'dexie';
import type {
  LayerUnitContentDocType,
  LayerUnitDocType,
  TierDefinitionDocType,
  UtteranceDocType,
  UtteranceMorphemeDocType,
  UtteranceTokenDocType,
} from '../types';
import { upgradeM18LinguisticUtteranceCutover } from './m18LinguisticUtteranceCutover';

/**
 * Must match `JieyuDexie` v36/v37 `stores({ ... })` for these tables — update when engine changes.
 */
export const M18_PRE37_STORES = {
  tier_definitions: 'id, textId, key, parentTierId, tierType, contentType',
  utterances:
    'id, textId, mediaId, [textId+mediaId], [mediaId+startTime], [textId+startTime], startTime, updatedAt, speakerId',
  utterance_tokens: 'id, textId, utteranceId, [utteranceId+tokenIndex], lexemeId',
  utterance_morphemes: 'id, textId, utteranceId, tokenId, [tokenId+morphemeIndex], lexemeId',
  layer_units:
    'id, textId, mediaId, layerId, unitType, parentUnitId, rootUnitId, speakerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [parentUnitId+startTime], [layerId+unitType], [textId+layerId]',
  layer_unit_contents:
    'id, textId, unitId, layerId, contentRole, [unitId+contentRole], [contentRole+updatedAt], sourceType, [layerId+updatedAt], updatedAt',
} as const;

export const M18_V37_TOKEN_MORPH_STORES = {
  utterances: null,
  utterance_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
  utterance_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
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
  utterances!: Table<UtteranceDocType, string>;
  utterance_tokens!: Table<UtteranceTokenDocType, string>;
  utterance_morphemes!: Table<UtteranceMorphemeDocType, string>;
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
  utterance_tokens!: Table<UtteranceTokenDocType, string>;
  utterance_morphemes!: Table<UtteranceMorphemeDocType, string>;
  layer_units!: Table<LayerUnitDocType, string>;
  layer_unit_contents!: Table<LayerUnitContentDocType, string>;

  constructor(name: string) {
    super(name);
    this.version(36).stores({ ...M18_PRE37_STORES });
    this.version(37).stores({ ...M18_V37_TOKEN_MORPH_STORES }).upgrade(async (tx: Transaction) => {
      await upgradeM18LinguisticUtteranceCutover(tx);
    });
  }
}
