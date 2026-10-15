import { describe, expect, it } from 'vitest';
import type { LayerUnitContentDocType, LayerUnitDocType } from '../../db';
import { planRegexSplit } from './regexSplitPlan';

const NOW = '2026-10-15T00:00:00.000Z';

function unit(): LayerUnitDocType {
  return {
    id: 'u1',
    textId: 'text-a',
    mediaId: 'm1',
    layerId: 'layer-a',
    unitType: 'unit',
    startTime: 0,
    endTime: 3,
    endAnchorId: 'anc-end',
    createdAt: NOW,
    updatedAt: NOW,
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

describe('planRegexSplit', () => {
  it('rewrites the existing primary text and copies the translation whole', () => {
    const plan = planRegexSplit(
      [{ unit: unit(), fullText: 'aa,bb' }],
      [content('pri', 'aa,bb', 'primary_text'), content('tr', 'whole gloss', 'translation')],
      /,/,
      NOW,
    );
    expect(plan.anchors).toHaveLength(0);
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
