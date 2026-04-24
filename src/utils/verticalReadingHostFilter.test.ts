import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import { filterTranslationLayersForVerticalReadingSourceUnit } from './verticalReadingHostFilter';

function tr(id: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'transcription',
    constraint: 'symbolic_association',
  } as LayerDocType;
}

function tl(id: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'en',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'translation',
    constraint: 'symbolic_association',
  } as LayerDocType;
}

function unit(id: string, layerId: string): LayerUnitDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    mediaId: 'm',
    layerId,
    startTime: 0,
    endTime: 1,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

describe('filterTranslationLayersForVerticalReadingSourceUnit', () => {
  it('returns both translation layers when source unit omits layerId and multiple transcriptions exist', () => {
    const trA = tr('tr-a');
    const trB = tr('tr-b');
    const tlA = tl('tl-a');
    const tlB = tl('tl-b');
    const u = unit('u1', '');
    const got = filterTranslationLayersForVerticalReadingSourceUnit(
      u,
      [tlA, tlB],
      [trA, trB],
      trA.id,
      trA.id,
      [],
    );
    expect(got.map((l) => l.id)).toEqual(['tl-a', 'tl-b']);
  });

  it('filters to layers linked to the unit transcription layer when links exist', () => {
    const trA = tr('tr-a');
    const trB = tr('tr-b');
    const tlA = tl('tl-a');
    const tlB = tl('tl-b');
    const u = unit('u1', 'tr-a');
    const got = filterTranslationLayersForVerticalReadingSourceUnit(
      u,
      [tlA, tlB],
      [trA, trB],
      trA.id,
      'tr-a',
      [
        { layerId: tlA.id, transcriptionLayerKey: trA.key, hostTranscriptionLayerId: trA.id, isPreferred: true },
        { layerId: tlB.id, transcriptionLayerKey: trB.key, hostTranscriptionLayerId: trB.id, isPreferred: false },
      ],
    );
    expect(got.map((l) => l.id)).toEqual(['tl-a']);
  });

  it('includes translations linked to tree-parent host when source unit is stamped on dependent transcription lane', () => {
    const trParent = { ...tr('tr-parent'), constraint: 'independent_boundary' as const };
    const trChild = { ...tr('tr-child'), parentLayerId: 'tr-parent' };
    const tlHost = tl('tl-1');
    const u = unit('u1', 'tr-child');
    const got = filterTranslationLayersForVerticalReadingSourceUnit(
      u,
      [tlHost],
      [trParent, trChild],
      trParent.id,
      trChild.id,
      [{ layerId: tlHost.id, transcriptionLayerKey: trParent.key, hostTranscriptionLayerId: trParent.id, isPreferred: true }],
    );
    expect(got.map((l) => l.id)).toEqual(['tl-1']);
  });
});
