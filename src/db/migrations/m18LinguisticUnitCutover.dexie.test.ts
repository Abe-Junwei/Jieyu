import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import type { TierDefinitionDocType, LayerUnitDocType, UnitTokenDocType } from '../types';
import { M18DexieV36Seed, M18DexieV36To37, m18DexieIsolationName } from './m18LinguisticUnitDexieHarness';

describe('M18 linguistic unit cutover (Dexie / IndexedDB)', () => {
  it('v36→v37 merges legacy unit and rewrites token rows on real IndexedDB', async () => {
    const name = m18DexieIsolationName('dexie');
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
      const unit: LayerUnitDocType = {
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
        unitId: 'utt-dexie',
        form: { default: 'w' },
        tokenIndex: 0,
        createdAt: iso,
        updatedAt: iso,
      };

      await seed.tier_definitions.add(tier);
      await seed.units.add(unit);
      await seed.unit_tokens.add(legacyToken as unknown as UnitTokenDocType);
      await seed.close();

      const db = new M18DexieV36To37(name);
      await db.open();

      const units = await db.layer_units.toArray();
      expect(units.filter((u) => u.unitType === 'unit')).toHaveLength(1);
      expect(units[0]).toMatchObject({ id: 'utt-dexie', unitType: 'unit', textId: 'text-dexie' });

      const contents = await db.layer_unit_contents.toArray();
      expect(contents).toHaveLength(1);
      expect(contents[0]).toMatchObject({ unitId: 'utt-dexie', contentRole: 'primary_text' });

      const tok = await db.unit_tokens.get('tok-dexie');
      expect(tok).toBeDefined();
      expect(tok).toMatchObject({ unitId: 'utt-dexie', id: 'tok-dexie' });
      expect(tok as unknown as Record<string, unknown>).not.toHaveProperty('unitId');

      await db.close();
    } finally {
      await Dexie.delete(name);
    }
  });

  it('v36→v37 rejects open when tokens reference a missing host (no legacy unit, no pre-seeded unit)', async () => {
    const name = m18DexieIsolationName('dexie-orphan');
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
      await seed.unit_tokens.add({
        id: 'tok-orphan',
        textId: 'text-dexie-2',
        unitId: 'ghost-host',
        form: { default: 'x' },
        tokenIndex: 0,
        createdAt: iso,
        updatedAt: iso,
      } as unknown as UnitTokenDocType);
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
