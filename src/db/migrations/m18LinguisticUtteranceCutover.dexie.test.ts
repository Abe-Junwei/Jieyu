import 'fake-indexeddb/auto';
import Dexie, { type Table, type Transaction } from 'dexie';
import { describe, expect, it } from 'vitest';
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
const M18_PRE37_STORES = {
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

const M18_V37_TOKEN_MORPH_STORES = {
  utterances: null,
  utterance_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
  utterance_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
} as const;

function testDbName(): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rnd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `jieyu-m18-dexie-${id}`;
}

/** Open at v36 only, seed fixtures, then close — used before attaching v37. */
class M18DexieV36Seed extends Dexie {
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
class M18DexieV36To37 extends Dexie {
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

describe('M18 linguistic utterance cutover (Dexie / IndexedDB)', () => {
  it('v36→v37 merges legacy utterance and rewrites token rows on real IndexedDB', async () => {
    const name = testDbName();
    const iso = '2026-04-15T12:00:00.000Z';

    try {
      await Dexie.delete(name);
      const seed = new M18DexieV36Seed(name);
      await seed.open();

      const tier: TierDefinitionDocType = {
        id: 'tier-dexie-trc',
        textId: 'text-dexie',
        key: 'trc',
        name: { default: 'T' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        languageId: 'eng',
        isDefault: true,
        sortOrder: 0,
        createdAt: iso,
        updatedAt: iso,
      };
      const utterance: UtteranceDocType = {
        id: 'utt-dexie',
        textId: 'text-dexie',
        mediaId: 'media-dexie',
        startTime: 0,
        endTime: 2,
        transcription: { default: 'hello' },
        createdAt: iso,
        updatedAt: iso,
      };
      const legacyToken = {
        id: 'tok-dexie',
        textId: 'text-dexie',
        utteranceId: 'utt-dexie',
        form: { default: 'w' },
        tokenIndex: 0,
        createdAt: iso,
        updatedAt: iso,
      };

      await seed.tier_definitions.add(tier);
      await seed.utterances.add(utterance);
      await seed.utterance_tokens.add(legacyToken as unknown as UtteranceTokenDocType);
      await seed.close();

      const db = new M18DexieV36To37(name);
      await db.open();

      const units = await db.layer_units.toArray();
      expect(units.filter((u) => u.unitType === 'utterance')).toHaveLength(1);
      expect(units[0]).toMatchObject({ id: 'utt-dexie', unitType: 'utterance', textId: 'text-dexie' });

      const contents = await db.layer_unit_contents.toArray();
      expect(contents).toHaveLength(1);
      expect(contents[0]).toMatchObject({ unitId: 'utt-dexie', contentRole: 'primary_text' });

      const tok = await db.utterance_tokens.get('tok-dexie');
      expect(tok).toBeDefined();
      expect(tok).toMatchObject({ unitId: 'utt-dexie', id: 'tok-dexie' });
      expect(tok as unknown as Record<string, unknown>).not.toHaveProperty('utteranceId');

      await db.close();
    } finally {
      await Dexie.delete(name);
    }
  });

  it('v36→v37 rejects open when tokens reference a missing host (no legacy utterance, no pre-seeded unit)', async () => {
    const name = testDbName();
    const iso = '2026-04-15T12:00:00.000Z';

    try {
      await Dexie.delete(name);
      const seed = new M18DexieV36Seed(name);
      await seed.open();

      const tier: TierDefinitionDocType = {
        id: 'tier-dexie-trc-2',
        textId: 'text-dexie-2',
        key: 'trc',
        name: { default: 'T' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        languageId: 'eng',
        isDefault: true,
        sortOrder: 0,
        createdAt: iso,
        updatedAt: iso,
      };
      await seed.tier_definitions.add(tier);
      await seed.utterance_tokens.add({
        id: 'tok-orphan',
        textId: 'text-dexie-2',
        utteranceId: 'ghost-host',
        form: { default: 'x' },
        tokenIndex: 0,
        createdAt: iso,
        updatedAt: iso,
      } as unknown as UtteranceTokenDocType);
      await seed.close();

      const db = new M18DexieV36To37(name);
      await expect(db.open()).rejects.toThrow(/ghost-host/);
      if (db.isOpen()) {
        await db.close();
      }
    } finally {
      await Dexie.delete(name);
    }
  });
});
