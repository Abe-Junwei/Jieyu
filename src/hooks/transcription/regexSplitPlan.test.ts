import { describe, expect, it } from 'vitest';
import type {
  AnchorDocType,
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from '../../db';
import { exportToEaf } from '../../services/eaf/eafExport';
import { planRegexSplit } from './regexSplitPlan';

const NOW = '2026-10-15T00:00:00.000Z';

function unit(overrides: Partial<LayerUnitDocType> = {}): LayerUnitDocType {
  return {
    id: 'u1',
    textId: 'text-a',
    mediaId: 'm1',
    layerId: 'layer-a',
    unitType: 'unit',
    startTime: 0,
    endTime: 3,
    startAnchorId: 'anc-start',
    endAnchorId: 'anc-end',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as LayerUnitDocType;
}

function content(
  id: string,
  text: string,
  role: 'primary_text' | 'translation',
): LayerUnitContentDocType {
  return {
    id,
    textId: 'text-a',
    unitId: 'u1',
    layerId: role === 'primary_text' ? 'layer-a' : 'layer-tr',
    contentRole: role,
    modality: 'text',
    text,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const existingAnchors: AnchorDocType[] = [
  { id: 'anc-start', mediaId: 'm1', time: 0, createdAt: NOW },
  { id: 'anc-end', mediaId: 'm1', time: 3, createdAt: NOW },
];

describe('planRegexSplit', () => {
  it('rewrites the existing primary text and copies the translation whole', () => {
    const plan = planRegexSplit(
      [{ unit: unit(), fullText: 'aa,bb' }],
      [content('pri', 'aa,bb', 'primary_text'), content('tr', 'whole gloss', 'translation')],
      /,/,
      NOW,
    );
    expect(plan.contents.find((row) => row.id === 'pri')).toMatchObject({ text: 'aa' });
    const copy = plan.contents.find((row) => row.id !== 'pri' && row.text === 'whole gloss');
    expect(copy?.unitId).not.toBe('u1');
    expect(
      plan.contents.filter((row) => row.unitId !== 'u1' && row.contentRole === 'primary_text'),
    ).toEqual([expect.objectContaining({ text: 'bb' })]);
    expect(plan.projectionSources.map((row) => row.translation.text).sort()).toEqual([
      'bb',
      'whole gloss',
    ]);
  });

  it('creates an internal anchor for a two-way split and rewires end/start (#505)', () => {
    const plan = planRegexSplit([{ unit: unit(), fullText: 'aa,bb' }], [], /,/, NOW);
    expect(plan.anchors).toHaveLength(1);
    const mid = plan.anchors[0]!;
    expect(mid.time).toBe(1.5);
    expect(mid.mediaId).toBe('m1');

    const first = plan.units.find((row) => row.id === 'u1')!;
    const second = plan.units.find((row) => row.id !== 'u1')!;
    expect(first).toMatchObject({
      startTime: 0,
      endTime: 1.5,
      startAnchorId: 'anc-start',
      endAnchorId: mid.id,
    });
    expect(second).toMatchObject({
      startTime: 1.5,
      endTime: 3,
      startAnchorId: mid.id,
      endAnchorId: 'anc-end',
    });
  });

  it('creates N-1 internal anchors for an N-way split (#505)', () => {
    const plan = planRegexSplit([{ unit: unit(), fullText: 'aa,bb,cc' }], [], /,/, NOW);
    expect(plan.anchors).toHaveLength(2);
    expect(plan.units).toHaveLength(3);
    const [a1, a2] = plan.anchors;
    const [u0, u1, u2] = plan.units;
    expect(u0).toMatchObject({ startAnchorId: 'anc-start', endAnchorId: a1!.id });
    expect(u1).toMatchObject({ startAnchorId: a1!.id, endAnchorId: a2!.id });
    expect(u2).toMatchObject({ startAnchorId: a2!.id, endAnchorId: 'anc-end' });
  });

  it('exports EAF TIME_SLOTs from post-split anchors, not the old end (#505)', () => {
    const plan = planRegexSplit(
      [{ unit: unit(), fullText: 'aa,bb' }],
      [content('pri', 'aa,bb', 'primary_text')],
      /,/,
      NOW,
    );
    const layers: LayerDocType[] = [
      {
        id: 'layer-a',
        textId: 'text-a',
        key: 'trc',
        name: { zho: '转写' },
        layerType: 'transcription',
        languageId: 'und',
        modality: 'text',
        acceptsAudio: false,
        isDefault: true,
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      } as LayerDocType,
    ];
    const xml = exportToEaf({
      units: plan.units,
      anchors: [...existingAnchors, ...plan.anchors],
      layers,
      translations: plan.contents,
    });
    const slotValues = [...xml.matchAll(/TIME_VALUE="(\d+)"/g)].map((m) => Number(m[1]));
    expect(slotValues).toEqual(expect.arrayContaining([0, 1500, 3000]));
    // First ALIGNABLE must not span the whole original [0,3000] via stale end anchor.
    const alignables = [...xml.matchAll(/TIME_SLOT_REF1="([^"]+)" TIME_SLOT_REF2="([^"]+)"/g)];
    expect(alignables.length).toBeGreaterThanOrEqual(2);
    const idToMs = new Map(
      [...xml.matchAll(/TIME_SLOT_ID="([^"]+)" TIME_VALUE="(\d+)"/g)].map((m) => [
        m[1]!,
        Number(m[2]),
      ]),
    );
    const ranges = alignables.map(([_, a, b]) => [idToMs.get(a!)!, idToMs.get(b!)!] as const);
    expect(ranges).toContainEqual([0, 1500]);
    expect(ranges).toContainEqual([1500, 3000]);
    expect(ranges).not.toContainEqual([0, 3000]);
    expect(ranges).not.toContainEqual([3000, 3000]);
  });

  it('splits the row on the unit layer when a newer translation has the same text', () => {
    const { contentRole: _role, ...sameText } = content('tr-same', 'aa,bb', 'translation');
    const plan = planRegexSplit(
      [{ unit: unit(), fullText: 'aa,bb' }],
      [
        content('pri', 'aa,bb', 'primary_text'),
        { ...sameText, updatedAt: '2026-10-16T00:00:00.000Z' },
      ],
      /,/,
      NOW,
    );
    expect(plan.contents.find((row) => row.id === 'pri')).toMatchObject({ text: 'aa' });
    expect(plan.contents.some((row) => row.id === 'tr-same')).toBe(false);
  });

  it('inserts a primary row when the unit has none', () => {
    const plan = planRegexSplit([{ unit: unit(), fullText: 'aa,bb' }], [], /,/, NOW);
    expect(plan.contents.filter((row) => row.unitId === 'u1')).toEqual([
      expect.objectContaining({ text: 'aa', contentRole: 'primary_text' }),
    ]);
  });
});
