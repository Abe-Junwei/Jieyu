import { describe, expect, it, vi } from 'vitest';
import { buildProjectIdRemap, remapProjectCollections } from './projectPackageIdRemap';

describe('project package id remap', () => {
  it('remaps ids, references, id-keyed objects and composite note targets; keeps language codes', () => {
    let next = 0;
    const collections = {
      texts: [{ id: 't1', title: { default: 't1 stays text? no: exact match only' } }],
      tier_definitions: [{ id: 'L1', textId: 't1', languageId: 'user:x' }],
      languages: [{ id: 'user:x', textId: 't1' }],
      user_notes: [{ id: 'n1', targetId: 'u1::L1::@waveform', content: { default: 'see L1' } }],
      layer_units: [{ id: 'u1', layerId: 'L1', textId: 't1', settings: { L1: { visible: true } } }],
    };
    const map = buildProjectIdRemap(collections, () => `new-${(next += 1)}`);
    expect(map.has('user:x')).toBe(false);
    const out = remapProjectCollections(collections, map) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const t = map.get('t1');
    const l = map.get('L1');
    const u = map.get('u1');
    expect(out.tier_definitions![0]).toEqual({ id: l, textId: t, languageId: 'user:x' });
    expect(out.user_notes![0]).toMatchObject({
      targetId: `${u}::${l}::@waveform`,
      content: { default: 'see L1' },
    });
    expect(out.layer_units![0]!.settings).toEqual({ [l!]: { visible: true } });
    expect(out.languages![0]).toEqual({ id: 'user:x', textId: t });
    // 输入不变 | Input untouched
    expect(collections.tier_definitions[0]!.id).toBe('L1');
  });

  it('allocates v4 UUIDs by default when crypto only has getRandomValues (http pages)', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) });
    try {
      const map = buildProjectIdRemap({
        texts: [{ id: 't1' }],
        tier_definitions: [{ id: 'L1', textId: 't1' }],
      });
      const ids = [...map.values()];
      expect(ids).toHaveLength(2);
      for (const id of ids) {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
      expect(new Set(ids).size).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
