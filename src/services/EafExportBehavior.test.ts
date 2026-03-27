// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportToEaf, importFromEaf } from './EafService';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType, UtteranceTextDocType } from '../db';

function withEafKeyMeta(baseKey: string, tierId?: string): string {
  if (!tierId) return baseKey;
  const payload = JSON.stringify({ tierId });
  return `${baseKey}__eafmeta_${encodeURIComponent(payload)}`;
}

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation'; key: string }): LayerDocType {
  const now = '2026-03-25T00:00:00.000Z';
  return {
    ...overrides,
    id: overrides.id,
    textId: 'text_1',
    key: overrides.key,
    name: overrides.name ?? { eng: overrides.key, zho: overrides.key },
    layerType: overrides.layerType,
    languageId: 'en',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    isDefault: overrides.layerType === 'transcription',
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

function makeUtterance(): UtteranceDocType {
  const now = '2026-03-25T00:00:00.000Z';
  return {
    id: 'utt_1',
    textId: 'text_1',
    mediaId: 'media_1',
    startTime: 0,
    endTime: 1,
    annotationStatus: 'raw',
    createdAt: now,
    updatedAt: now,
  } as UtteranceDocType;
}

function makeTranslation(overrides: Partial<UtteranceTextDocType> & { id: string; layerId: string; utteranceId: string; text: string }): UtteranceTextDocType {
  const now = '2026-03-25T00:00:00.000Z';
  return {
    ...overrides,
    id: overrides.id,
    utteranceId: overrides.utteranceId,
    layerId: overrides.layerId,
    modality: 'text',
    text: overrides.text,
    sourceType: 'human',
    createdAt: now,
    updatedAt: now,
  } as UtteranceTextDocType;
}

describe('EAF export behavior for constraint layers', () => {
  it('exports time_subdivision as ALIGNABLE_ANNOTATION + translation-subdivision-lt', () => {
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: 'trc_default' });
    const sub = makeLayer({
      id: 'trl_sub',
      layerType: 'translation',
      key: 'trl_sub',
      name: { eng: 'SubTier', zho: 'SubTier' },
      constraint: 'time_subdivision',
      parentLayerId: trc.id,
    });

    const xml = exportToEaf({
      utterances: [makeUtterance()],
      layers: [trc, sub],
      translations: [makeTranslation({ id: 'utr_sub_1', layerId: sub.id, utteranceId: 'utt_1', text: 'sub-text' })],
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const tier = doc.querySelector('TIER[TIER_ID="SubTier"]');
    expect(tier).not.toBeNull();
    expect(tier?.getAttribute('LINGUISTIC_TYPE_REF')).toBe('translation-subdivision-lt');
    expect(tier?.querySelector('ALIGNABLE_ANNOTATION')).not.toBeNull();
    expect(tier?.querySelector('REF_ANNOTATION')).toBeNull();
  });

  it('uses independent layer segment boundaries when exporting ALIGNABLE_ANNOTATION', () => {
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: 'trc_default' });
    const independent = makeLayer({
      id: 'trl_ind',
      layerType: 'translation',
      key: 'trl_ind',
      name: { eng: 'IndependentTier', zho: 'IndependentTier' },
      constraint: 'independent_boundary',
    });

    const seg: LayerSegmentDocType = {
      id: 'seg_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: independent.id,
      utteranceId: 'utt_1',
      startTime: 0.2,
      endTime: 0.9,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };

    const xml = exportToEaf({
      utterances: [makeUtterance()],
      layers: [trc, independent],
      translations: [makeTranslation({ id: 'utr_ind_1', layerId: independent.id, utteranceId: 'utt_1', text: 'ind-text' })],
      layerSegments: new Map([[independent.id, [seg]]]),
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const tier = doc.querySelector('TIER[TIER_ID="IndependentTier"]');
    expect(tier).not.toBeNull();

    const ann = tier?.querySelector('ALIGNABLE_ANNOTATION');
    expect(ann).not.toBeNull();
    const ts1 = ann?.getAttribute('TIME_SLOT_REF1') ?? '';
    const ts2 = ann?.getAttribute('TIME_SLOT_REF2') ?? '';

    const timeSlots = new Map<string, number>();
    doc.querySelectorAll('TIME_SLOT').forEach((slot) => {
      const id = slot.getAttribute('TIME_SLOT_ID');
      const val = slot.getAttribute('TIME_VALUE');
      if (id && val) timeSlots.set(id, Number(val));
    });

    expect(timeSlots.get(ts1)).toBe(200);
    expect(timeSlots.get(ts2)).toBe(900);
  });

  it('exports one ALIGNABLE_ANNOTATION per segment for multi-segment independent boundary utterance', () => {
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: 'trc_default' });
    const independent = makeLayer({
      id: 'trl_ind_multi',
      layerType: 'translation',
      key: 'trl_ind_multi',
      name: { eng: 'IndependentMulti', zho: 'IndependentMulti' },
      constraint: 'independent_boundary',
    });

    const segA: LayerSegmentDocType = {
      id: 'seg_multi_a',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: independent.id,
      utteranceId: 'utt_1',
      startTime: 0.1,
      endTime: 0.4,
      ordinal: 0,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };
    const segB: LayerSegmentDocType = {
      id: 'seg_multi_b',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: independent.id,
      utteranceId: 'utt_1',
      startTime: 0.6,
      endTime: 0.9,
      ordinal: 1,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };

    const xml = exportToEaf({
      utterances: [makeUtterance()],
      layers: [trc, independent],
      translations: [
        makeTranslation({ id: 'utr_ind_multi_1', layerId: independent.id, utteranceId: 'utt_1', text: 'part-a' }),
        makeTranslation({ id: 'utr_ind_multi_2', layerId: independent.id, utteranceId: 'utt_1', text: 'part-b' }),
      ],
      layerSegments: new Map([[independent.id, [segA, segB]]]),
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const tier = doc.querySelector('TIER[TIER_ID="IndependentMulti"]');
    expect(tier).not.toBeNull();

    const anns = tier?.querySelectorAll('ALIGNABLE_ANNOTATION') ?? [];
    expect(anns.length).toBe(2);

    const values = Array.from(tier?.querySelectorAll('ANNOTATION_VALUE') ?? []).map((node) => node.textContent ?? '');
    expect(values).toEqual(['part-a', 'part-b']);
  });

  it('prefers parentLayerId mapped tier as PARENT_REF during export', () => {
    const defaultTrc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: withEafKeyMeta('trc_default', 'TRC_DEFAULT') });
    const customParent = makeLayer({
      id: 'trc_custom',
      layerType: 'transcription',
      key: withEafKeyMeta('trc_custom', 'TRC_CUSTOM'),
      isDefault: false,
      sortOrder: 1,
    });
    const trl = makeLayer({
      id: 'trl_child',
      layerType: 'translation',
      key: withEafKeyMeta('trl_child', 'TRL_CHILD'),
      constraint: 'symbolic_association',
      parentLayerId: customParent.id,
    });

    const xml = exportToEaf({
      utterances: [makeUtterance()],
      layers: [defaultTrc, customParent, trl],
      translations: [
        makeTranslation({ id: 'utr_default', layerId: defaultTrc.id, utteranceId: 'utt_1', text: 'hello' }),
        makeTranslation({ id: 'utr_child', layerId: trl.id, utteranceId: 'utt_1', text: 'child' }),
      ],
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const childTier = doc.querySelector('TIER[TIER_ID="TRL_CHILD"]');
    expect(childTier).not.toBeNull();
    expect(childTier?.getAttribute('PARENT_REF')).toBe('TRC_CUSTOM');
  });

  it('keeps parent/constraint semantic on import after export (round-trip)', () => {
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: withEafKeyMeta('trc_default', 'TRC_MAIN') });
    const trl = makeLayer({
      id: 'trl_sub',
      layerType: 'translation',
      key: withEafKeyMeta('trl_sub', 'TRL_SUB'),
      constraint: 'time_subdivision',
      parentLayerId: trc.id,
    });

    const xml = exportToEaf({
      utterances: [makeUtterance()],
      layers: [trc, trl],
      translations: [
        makeTranslation({ id: 'utr_main', layerId: trc.id, utteranceId: 'utt_1', text: 'main' }),
        makeTranslation({ id: 'utr_sub', layerId: trl.id, utteranceId: 'utt_1', text: 'sub' }),
      ],
    });

    const imported = importFromEaf(xml);
    const subConstraint = imported.tierConstraints.get('TRL_SUB');
    expect(subConstraint?.constraint).toBe('time_subdivision');
    expect(subConstraint?.parentTierId).toBe('TRC_MAIN');
  });
});
