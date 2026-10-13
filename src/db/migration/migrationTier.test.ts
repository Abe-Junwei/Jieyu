/** T40（rev5 4a）：区间分级 | T40: range tiering */
import { describe, expect, it } from 'vitest';
import { classifySchemaStep, classifyUpgradeRange, parseDexieStoreSpec } from './migrationTier';
import { JIEYU_SCHEMA_VERSIONS, type JieyuSchemaVersion } from './schemaVersions';
import {
  SYNTH_LEDGER_ADDITIVE,
  SYNTH_V1,
  SYNTH_V2_ADDITIVE,
  SYNTH_V2_REWRITING,
  SYNTH_V3_UNDECLARED,
} from './__fixtures__/syntheticLedgers';

describe('migration tiering (8.2 / D2)', () => {
  it('parses Dexie store specs', () => {
    const parsed = parseDexieStoreSpec('++id, &code, *tags, [a+b]');
    expect(parsed.primaryKey).toMatchObject({ name: 'id', auto: true });
    expect(parsed.indexes.get('code')).toMatchObject({ unique: true });
    expect(parsed.indexes.get('tags')).toMatchObject({ multi: true });
    expect(parsed.indexes.has('[a+b]')).toBe(true);
  });

  it('declared additive with only new stores / non-unique indexes stays additive', () => {
    const result = classifyUpgradeRange(SYNTH_LEDGER_ADDITIVE, 1, 2);
    expect(result.tier).toBe('additive');
    expect(result.steps).toEqual([
      { version: 2, declared: 'additive', effective: 'additive', reasons: [] },
    ]);
  });

  it('T40: v1 → v3 with one rewriting step and one undeclared step is rewriting as a whole', () => {
    const ledger = [SYNTH_V1, SYNTH_V2_REWRITING, SYNTH_V3_UNDECLARED];
    const result = classifyUpgradeRange(ledger, 1, 3);
    expect(result.tier).toBe('rewriting');
    expect(result.steps.map((step) => [step.version, step.effective])).toEqual([
      [2, 'rewriting'],
      [3, 'rewriting'],
    ]);
    expect(result.steps[1]!.reasons.map((reason) => reason.kind)).toEqual(['undeclared']);
  });

  it('T40: an additive step followed by an undeclared step is rewriting', () => {
    const result = classifyUpgradeRange([SYNTH_V1, SYNTH_V2_ADDITIVE, SYNTH_V3_UNDECLARED], 1, 3);
    expect(result.tier).toBe('rewriting');
    // 只看 (2, 3]：仍然是 rewriting | the (2, 3] sub-range alone is still rewriting
    expect(
      classifyUpgradeRange([SYNTH_V1, SYNTH_V2_ADDITIVE, SYNTH_V3_UNDECLARED], 2, 3).tier,
    ).toBe('rewriting');
    // 只看 (1, 2]：additive | the (1, 2] sub-range alone is additive
    expect(
      classifyUpgradeRange([SYNTH_V1, SYNTH_V2_ADDITIVE, SYNTH_V3_UNDECLARED], 1, 2).tier,
    ).toBe('additive');
  });

  it.each<[string, Record<string, string | null>, string]>([
    ['adds a unique index to an existing store', { items: 'id, name, &sku' }, 'unique-index-added'],
    ['makes an existing index unique', { items: 'id, &name' }, 'unique-index-added'],
    ['changes the primary key', { items: 'uuid, name' }, 'primary-key-changed'],
    ['deletes a store', { notes: null }, 'store-deleted'],
    ['removes an index', { items: 'id' }, 'index-removed'],
  ])('a declared-additive step that %s is rewriting', (_label, stores, kind) => {
    const v2: JieyuSchemaVersion = { version: 2, tier: 'additive', stores };
    const step = classifySchemaStep([SYNTH_V1, v2], 2);
    expect(step.effective).toBe('rewriting');
    expect(step.reasons.map((reason) => reason.kind)).toContain(kind);
  });

  it('an additive step with an upgrader is rewriting', () => {
    const v2: JieyuSchemaVersion = {
      version: 2,
      tier: 'additive',
      stores: {},
      upgrade: () => undefined,
    };
    expect(classifySchemaStep([SYNTH_V1, v2], 2).effective).toBe('rewriting');
  });

  it('fresh install (from 0) needs no migration', () => {
    expect(classifyUpgradeRange(SYNTH_LEDGER_ADDITIVE, 0, 2).tier).toBe('additive');
  });

  it('an installed version missing from the ledger is rewriting', () => {
    expect(classifyUpgradeRange([SYNTH_V1, { ...SYNTH_V2_ADDITIVE, version: 3 }], 2, 3).tier).toBe(
      'rewriting',
    );
  });

  it('the real ledger currently holds only the baseline', () => {
    expect(JIEYU_SCHEMA_VERSIONS.map((entry) => entry.version)).toEqual([1]);
  });
});
