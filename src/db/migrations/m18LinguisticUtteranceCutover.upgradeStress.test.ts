/**
 * Large v36→v37 IndexedDB upgrade exercise (fake-indexeddb).
 * Skipped unless `M18_UPGRADE_STRESS_UTTERANCES` is a positive integer.
 *
 * Run: `npm run stress:m18-v37-upgrade`
 * Tune: `cross-env M18_UPGRADE_STRESS_UTTERANCES=8000 vitest run src/db/migrations/m18LinguisticUtteranceCutover.upgradeStress.test.ts`
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import type { TierDefinitionDocType, UtteranceDocType, UtteranceTokenDocType } from '../types';
import {
  M18DexieV36Seed,
  M18DexieV36To37,
  m18DexieIsolationName,
} from './m18LinguisticUtteranceDexieHarness';

const STRESS_N = Number(process.env.M18_UPGRADE_STRESS_UTTERANCES ?? '0');
const stressDescribe = STRESS_N > 0 ? describe : describe.skip;

const CHUNK = 400;
const ISO = '2026-04-15T12:00:00.000Z';
const TEXT_ID = 'text-m18-stress';
const TIER_ID = 'tier-m18-stress-trc';

stressDescribe('M18 v36→v37 upgrade stress (IndexedDB)', () => {
  it('merges many legacy utterances and rewrites token foreign keys', async () => {
    const N = STRESS_N;
    const name = m18DexieIsolationName('stress');

    try {
      await Dexie.delete(name);
      const seed = new M18DexieV36Seed(name);
      await seed.open();

      const tier: TierDefinitionDocType = {
        id: TIER_ID,
        textId: TEXT_ID,
        key: 'trc',
        name: { default: 'T' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        languageId: 'eng',
        isDefault: true,
        sortOrder: 0,
        createdAt: ISO,
        updatedAt: ISO,
      };
      await seed.tier_definitions.add(tier);

      for (let start = 0; start < N; start += CHUNK) {
        const end = Math.min(N, start + CHUNK);
        const utterances: UtteranceDocType[] = [];
        for (let i = start; i < end; i += 1) {
          utterances.push({
            id: `utt-stress-${i}`,
            textId: TEXT_ID,
            mediaId: 'media-stress',
            startTime: i,
            endTime: i + 1,
            transcription: { default: 'x' },
            createdAt: ISO,
            updatedAt: ISO,
          });
        }
        await seed.utterances.bulkPut(utterances);
      }

      for (let start = 0; start < N; start += CHUNK) {
        const end = Math.min(N, start + CHUNK);
        const tokens: UtteranceTokenDocType[] = [];
        for (let i = start; i < end; i += 1) {
          for (const k of [0, 1] as const) {
            tokens.push({
              id: `tok-stress-${i}-${k}`,
              textId: TEXT_ID,
              utteranceId: `utt-stress-${i}`,
              form: { default: 'w' },
              tokenIndex: k,
              createdAt: ISO,
              updatedAt: ISO,
            } as unknown as UtteranceTokenDocType);
          }
        }
        await seed.utterance_tokens.bulkPut(tokens);
      }

      await seed.close();

      const db = new M18DexieV36To37(name);
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      await db.open();
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      process.stdout.write(
        `[m18-upgrade-stress] utterances=${N} tokens=${2 * N} upgradeMs=${(t1 - t0).toFixed(0)}\n`,
      );

      const utteranceUnits = await db.layer_units.where('unitType').equals('utterance').count();
      expect(utteranceUnits).toBe(N);

      const tokenCount = await db.utterance_tokens.count();
      expect(tokenCount).toBe(2 * N);

      const sample = await db.utterance_tokens.get('tok-stress-0-0');
      expect(sample).toMatchObject({ unitId: 'utt-stress-0', id: 'tok-stress-0-0' });
      expect(sample as unknown as Record<string, unknown>).not.toHaveProperty('utteranceId');

      const last = await db.utterance_tokens.get(`tok-stress-${N - 1}-1`);
      expect(last).toMatchObject({ unitId: `utt-stress-${N - 1}` });

      await db.close();
    } finally {
      await Dexie.delete(name);
    }
  }, 600_000);
});
