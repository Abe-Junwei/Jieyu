import type { Transaction } from 'dexie';
import { describe, expect, it } from 'vitest';
import { assertM18SubgraphHostsResolveToUnitLayerUnits, collectM18SubgraphReferencedUnitIds, upgradeM18LinguisticUnitCutover } from './m18LinguisticUnitCutover';
import m18PostCutoverGolden from './fixtures/m18-post-cutover-golden.json';

/**
 * In-memory Dexie transaction stand-in for `upgradeM18LinguisticUnitCutover` replay tests.
 * (Real v37 upgrade runs in engine; here we assert ordering, rewrites, and idempotency.)
 */
type M18MockTxOptions = {
  /** Extra unit-type `layer_units` rows present before merge (already canonical). */
  preLayerUnits?: Record<string, unknown>[];
  /** Legacy `units` table rows (default: one host). */
  units?: Record<string, unknown>[];
  /** Token rows as read pre-migration. */
  tokens?: Record<string, unknown>[];
  /** Morpheme rows as read pre-migration. */
  morphemes?: Record<string, unknown>[];
};

function buildM18MockTx(options?: M18MockTxOptions) {
  const tiers = [
    {
      id: 'trc-m18',
      textId: 'text-m18',
      key: 'bridge_trc_m18',
      name: { default: 'T' },
      tierType: 'time-aligned' as const,
      contentType: 'transcription' as const,
      languageId: 'eng',
      isDefault: true,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const units: Record<string, unknown>[] = options?.units ?? [
    {
      id: 'utt-m18',
      textId: 'text-m18',
      mediaId: 'media-m18',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'hi' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const tokens: Record<string, unknown>[] = options?.tokens ?? [
    {
      id: 'tok-m18',
      textId: 'text-m18',
      unitId: 'utt-m18',
      form: { default: 'w' },
      tokenIndex: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const morphemes: Record<string, unknown>[] = options?.morphemes ?? [
    {
      id: 'morph-m18',
      textId: 'text-m18',
      unitId: 'utt-m18',
      tokenId: 'tok-m18',
      form: { default: 'm' },
      morphemeIndex: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const layer_units: Record<string, unknown>[] = [...(options?.preLayerUnits ?? [])];
  const layer_unit_contents: Record<string, unknown>[] = [];

  const table = (name: string) => {
    if (name === 'tier_definitions') return { toArray: async () => tiers };
    if (name === 'units') return { toArray: async () => units };
    if (name === 'unit_tokens') {
      return {
        toArray: async () => tokens.map((r) => ({ ...r })),
        put: async (row: Record<string, unknown>) => {
          const idx = tokens.findIndex((t) => t.id === row.id);
          if (idx >= 0) tokens[idx] = row;
        },
      };
    }
    if (name === 'unit_morphemes') {
      return {
        toArray: async () => morphemes.map((r) => ({ ...r })),
        put: async (row: Record<string, unknown>) => {
          const idx = morphemes.findIndex((t) => t.id === row.id);
          if (idx >= 0) morphemes[idx] = row;
        },
      };
    }
    if (name === 'layer_units') {
      return {
        toArray: async () => layer_units.map((r) => ({ ...r })),
        put: async (row: Record<string, unknown>) => {
          const idx = layer_units.findIndex((u) => u.id === row.id);
          if (idx >= 0) layer_units[idx] = row;
          else layer_units.push(row);
        },
      };
    }
    if (name === 'layer_unit_contents') {
      return {
        toArray: async () => layer_unit_contents.map((r) => ({ ...r })),
        put: async (row: Record<string, unknown>) => {
          const idx = layer_unit_contents.findIndex((c) => c.id === row.id);
          if (idx >= 0) layer_unit_contents[idx] = row;
          else layer_unit_contents.push(row);
        },
      };
    }
    throw new Error(`unexpected table ${name}`);
  };

  return {
    table,
    tiers,
    units,
    tokens,
    morphemes,
    layer_units,
    layer_unit_contents,
  };
}

describe('M18 linguistic unit cutover replay', () => {
  it('collectM18SubgraphReferencedUnitIds reads unitId or unitId', () => {
    const ids = collectM18SubgraphReferencedUnitIds(
      [{ unitId: 'a' }, { unitId: 'b' }],
      [{ unitId: 'c' }],
    );
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('assertM18SubgraphHostsResolve throws when host id has no unit layer unit', () => {
    expect(() => assertM18SubgraphHostsResolveToUnitLayerUnits({
      subgraphReferencedUnitIds: new Set(['ghost']),
      preExistingUnitLayerUnitIds: new Set(),
      migratedUnitIdsFromLegacyTable: new Set(),
    })).toThrow(/ghost/);
  });

  it('merges units into layer_units, rewrites token/morpheme keys; second run is stable', async () => {
    const m = buildM18MockTx();
    await upgradeM18LinguisticUnitCutover({ table: m.table } as unknown as Transaction);

    expect(m.layer_units).toHaveLength(1);
    expect(m.layer_units[0]).toMatchObject(m18PostCutoverGolden.layer_units[0]!);
    expect(m.layer_unit_contents).toHaveLength(1);
    expect(m.layer_unit_contents[0]).toMatchObject(m18PostCutoverGolden.layer_unit_contents[0]!);
    expect(m.tokens[0]).toMatchObject(m18PostCutoverGolden.tokens[0]!);
    expect(m.morphemes[0]).toMatchObject(m18PostCutoverGolden.morphemes[0]!);

    const unitsSnap = JSON.stringify(m.layer_units);
    const contentsSnap = JSON.stringify(m.layer_unit_contents);
    const tokensSnap = JSON.stringify(m.tokens);
    const morphSnap = JSON.stringify(m.morphemes);

    await upgradeM18LinguisticUnitCutover({ table: m.table } as unknown as Transaction);

    expect(JSON.stringify(m.layer_units)).toBe(unitsSnap);
    expect(JSON.stringify(m.layer_unit_contents)).toBe(contentsSnap);
    expect(JSON.stringify(m.tokens)).toBe(tokensSnap);
    expect(JSON.stringify(m.morphemes)).toBe(morphSnap);
  });

  it('upgrade throws when subgraph references a host id with no unit layer unit and no legacy row', async () => {
    const m = buildM18MockTx({
      units: [],
      preLayerUnits: [],
      tokens: [
        {
          id: 'tok-orphan',
          textId: 'text-m18',
          unitId: 'ghost-host',
          form: { default: 'x' },
          tokenIndex: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      morphemes: [],
    });
    await expect(
      upgradeM18LinguisticUnitCutover({ table: m.table } as unknown as Transaction),
    ).rejects.toThrow(/ghost-host/);
  });

  it('upgrade succeeds when unit-type host already exists in layer_units (idempotent merge)', async () => {
    const preHost = {
      id: 'utt-m18',
      textId: 'text-m18',
      mediaId: 'media-m18',
      layerId: 'trc-m18',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const m = buildM18MockTx({
      preLayerUnits: [preHost],
    });
    await upgradeM18LinguisticUnitCutover({ table: m.table } as unknown as Transaction);
    expect(m.layer_units.filter((u) => u.unitType === 'unit')).toHaveLength(1);
    expect(m.tokens[0]).toMatchObject({ unitId: 'utt-m18' });
  });
});
