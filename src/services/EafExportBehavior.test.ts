// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { exportToEaf, importFromEaf } from './EafService';
import type { LayerDocType, LayerUnitDocType, OrthographyDocType, SpeakerDocType, LayerUnitContentDocType, LayerLinkDocType } from '../db';

function withEafKeyMeta(baseKey: string, meta?: string | { tierId?: string; langLabel?: string }): string {
  if (!meta) return baseKey;
  const payload = JSON.stringify(typeof meta === 'string' ? { tierId: meta } : meta);
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
    languageId: overrides.languageId ?? 'en',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    isDefault: overrides.layerType === 'transcription',
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

function makeUnit(): LayerUnitDocType {
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
  } as LayerUnitDocType;
}

function makeTranslation(overrides: Partial<LayerUnitContentDocType> & { id: string; layerId: string; unitId: string; text: string }): LayerUnitContentDocType {
  const now = '2026-03-25T00:00:00.000Z';
  return {
    ...overrides,
    id: overrides.id,
    unitId: overrides.unitId,
    layerId: overrides.layerId,
    modality: 'text',
    text: overrides.text,
    sourceType: 'human',
    createdAt: now,
    updatedAt: now,
  } as LayerUnitContentDocType;
}

function makeSpeaker(overrides: Partial<SpeakerDocType> & { id: string; name: string }): SpeakerDocType {
  const now = '2026-03-25T00:00:00.000Z';
  return {
    ...overrides,
    createdAt: now,
    updatedAt: now,
    id: overrides.id,
    name: overrides.name,
  } as SpeakerDocType;
}

function makeOrthography(overrides: Partial<OrthographyDocType> & { id: string; languageId: string }): OrthographyDocType {
  const now = '2026-03-25T00:00:00.000Z';
  const { id, languageId, ...restOverrides } = overrides;
  return {
    id,
    languageId,
    name: overrides.name ?? { eng: id, zho: id },
    createdAt: now,
    updatedAt: now,
    ...restOverrides,
  } as OrthographyDocType;
}

function makeLayerLink(overrides: Partial<LayerLinkDocType> & { id: string; layerId: string; transcriptionLayerKey: string; hostTranscriptionLayerId: string }): LayerLinkDocType {
  const now = '2026-03-25T00:00:00.000Z';
  return {
    id: overrides.id,
    layerId: overrides.layerId,
    transcriptionLayerKey: overrides.transcriptionLayerKey,
    linkType: overrides.linkType ?? 'free',
    isPreferred: overrides.isPreferred ?? false,
    createdAt: overrides.createdAt ?? now,
    hostTranscriptionLayerId: overrides.hostTranscriptionLayerId,
  };
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
    });

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [trc, sub],
      translations: [makeTranslation({ id: 'utr_sub_1', layerId: sub.id, unitId: 'utt_1', text: 'sub-text' })],
      layerLinks: [makeLayerLink({ id: 'link-sub', layerId: sub.id, transcriptionLayerKey: trc.key, hostTranscriptionLayerId: trc.id })],
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

    const seg: LayerUnitDocType = {
      id: 'seg_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: independent.id,
      unitId: 'utt_1',
      startTime: 0.2,
      endTime: 0.9,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [trc, independent],
      translations: [makeTranslation({ id: 'utr_ind_1', layerId: independent.id, unitId: 'utt_1', text: 'ind-text' })],
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

  it('exports one ALIGNABLE_ANNOTATION per segment for multi-segment independent boundary unit', () => {
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: 'trc_default' });
    const independent = makeLayer({
      id: 'trl_ind_multi',
      layerType: 'translation',
      key: 'trl_ind_multi',
      name: { eng: 'IndependentMulti', zho: 'IndependentMulti' },
      constraint: 'independent_boundary',
    });

    const segA: LayerUnitDocType = {
      id: 'seg_multi_a',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: independent.id,
      unitId: 'utt_1',
      startTime: 0.1,
      endTime: 0.4,
      ordinal: 0,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };
    const segB: LayerUnitDocType = {
      id: 'seg_multi_b',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: independent.id,
      unitId: 'utt_1',
      startTime: 0.6,
      endTime: 0.9,
      ordinal: 1,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [trc, independent],
      translations: [
        makeTranslation({ id: 'utr_ind_multi_1', layerId: independent.id, unitId: 'utt_1', text: 'part-a' }),
        makeTranslation({ id: 'utr_ind_multi_2', layerId: independent.id, unitId: 'utt_1', text: 'part-b' }),
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

  it('exports PARTICIPANT from explicit segment speakerId on independent transcription tiers', () => {
    const trc = makeLayer({
      id: 'trc_independent',
      layerType: 'transcription',
      key: 'trc_independent',
      name: { eng: 'IndependentTranscription', zho: 'IndependentTranscription' },
      constraint: 'independent_boundary',
      isDefault: false,
    });
    const defaultTrc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: 'trc_default' });
    const seg: LayerUnitDocType = {
      id: 'seg_spk_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: trc.id,
      speakerId: 'speaker_seg_1',
      startTime: 0.2,
      endTime: 0.9,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };
    const segmentContents = new Map([[trc.id, new Map([[seg.id, {
      id: 'seg_content_1',
      textId: 'text_1',
      segmentId: seg.id,
      layerId: trc.id,
      modality: 'text' as const,
      text: 'seg-text',
      sourceType: 'human' as const,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    }]])]]);

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [defaultTrc, trc],
      translations: [makeTranslation({ id: 'utr_seg_text', layerId: trc.id, unitId: 'utt_1', text: 'seg-text' })],
      layerSegments: new Map([[trc.id, [seg]]]),
      layerSegmentContents: segmentContents,
      speakers: [makeSpeaker({ id: 'speaker_seg_1', name: 'Segment Speaker' })],
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const tier = doc.querySelector('TIER[TIER_ID="IndependentTranscription"]');
    expect(tier).not.toBeNull();
    expect(tier?.getAttribute('PARTICIPANT')).toBe('Segment Speaker');
  });

  it('prefers preferred host link tier as PARENT_REF during export', () => {
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
    });

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [defaultTrc, customParent, trl],
      layerLinks: [
        makeLayerLink({
          id: 'link-trl-custom',
          layerId: trl.id,
          transcriptionLayerKey: customParent.key,
          hostTranscriptionLayerId: customParent.id,
          isPreferred: true,
        }),
      ],
      translations: [
        makeTranslation({ id: 'utr_default', layerId: defaultTrc.id, unitId: 'utt_1', text: 'hello' }),
        makeTranslation({ id: 'utr_child', layerId: trl.id, unitId: 'utt_1', text: 'child' }),
      ],
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const childTier = doc.querySelector('TIER[TIER_ID="TRL_CHILD"]');
    expect(childTier).not.toBeNull();
    expect(childTier?.getAttribute('PARENT_REF')).toBe('TRC_CUSTOM');
  });

  it('exports only preferred host and emits multi-host warning', () => {
    const defaultTrc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: withEafKeyMeta('trc_default', 'TRC_DEFAULT') });
    const trcA = makeLayer({ id: 'trc_a', layerType: 'transcription', key: withEafKeyMeta('trc_a', 'TRC_A'), isDefault: false, sortOrder: 1 });
    const trcB = makeLayer({ id: 'trc_b', layerType: 'transcription', key: withEafKeyMeta('trc_b', 'TRC_B'), isDefault: false, sortOrder: 2 });
    const trl = makeLayer({
      id: 'trl_child',
      layerType: 'translation',
      key: withEafKeyMeta('trl_child', 'TRL_CHILD'),
      constraint: 'symbolic_association',
    });
    const warningSpy = vi.fn();

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [defaultTrc, trcA, trcB, trl],
      layerLinks: [
        makeLayerLink({ id: 'link-a', layerId: trl.id, transcriptionLayerKey: trcA.key, hostTranscriptionLayerId: trcA.id, isPreferred: false }),
        makeLayerLink({ id: 'link-b', layerId: trl.id, transcriptionLayerKey: trcB.key, hostTranscriptionLayerId: trcB.id, isPreferred: true }),
      ],
      translations: [
        makeTranslation({ id: 'utr_default', layerId: defaultTrc.id, unitId: 'utt_1', text: 'hello' }),
        makeTranslation({ id: 'utr_child', layerId: trl.id, unitId: 'utt_1', text: 'child' }),
      ],
      onWarning: warningSpy,
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const childTier = doc.querySelector('TIER[TIER_ID="TRL_CHILD"]');
    expect(childTier).not.toBeNull();
    expect(childTier?.getAttribute('PARENT_REF')).toBe('TRC_B');
    expect(warningSpy).toHaveBeenCalledWith(expect.objectContaining({
      code: 'translation-multi-host-lossy',
      layerId: trl.id,
      hostCount: 2,
      preferredHostTranscriptionLayerId: trcB.id,
    }));
  });

  it('keeps parent/constraint semantic on import after export (round-trip)', () => {
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: withEafKeyMeta('trc_default', 'TRC_MAIN') });
    const trl = makeLayer({
      id: 'trl_sub',
      layerType: 'translation',
      key: withEafKeyMeta('trl_sub', 'TRL_SUB'),
      constraint: 'time_subdivision',
    });

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [trc, trl],
      translations: [
        makeTranslation({ id: 'utr_main', layerId: trc.id, unitId: 'utt_1', text: 'main' }),
        makeTranslation({ id: 'utr_sub', layerId: trl.id, unitId: 'utt_1', text: 'sub' }),
      ],
      layerLinks: [makeLayerLink({ id: 'link-roundtrip', layerId: trl.id, transcriptionLayerKey: trc.key, hostTranscriptionLayerId: trc.id })],
    });

    const imported = importFromEaf(xml);
    const subConstraint = imported.tierConstraints.get('TRL_SUB');
    expect(subConstraint?.constraint).toBe('time_subdivision');
    expect(subConstraint?.parentTierId).toBe('TRC_MAIN');
  });

  it('exports and re-imports tier orthography identity through header properties', () => {
    const trc = makeLayer({
      id: 'trc_default',
      layerType: 'transcription',
      key: withEafKeyMeta('trc_default', 'TRC_MAIN'),
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      bridgeId: 'xf-ar-latn',
    });
    const trl = makeLayer({
      id: 'trl_child',
      layerType: 'translation',
      key: withEafKeyMeta('trl_child', 'TRL_CHILD'),
      languageId: 'eng',
      orthographyId: 'ortho-eng',
    });

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [trc, trl],
      orthographies: [
        makeOrthography({ id: 'ortho-ar', languageId: 'ara', scriptTag: 'Arab', regionTag: 'EG', variantTag: 'fonipa' }),
        makeOrthography({ id: 'ortho-eng', languageId: 'eng', scriptTag: 'Latn' }),
      ],
      translations: [
        makeTranslation({ id: 'utr_main', layerId: trc.id, unitId: 'utt_1', text: 'مرحبا' }),
        makeTranslation({ id: 'utr_child', layerId: trl.id, unitId: 'utt_1', text: 'hello' }),
      ],
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const headerProperties = Array.from(doc.querySelectorAll('HEADER > PROPERTY')).reduce<Record<string, string>>((acc, property) => {
      const name = property.getAttribute('NAME');
      if (name) acc[name] = property.textContent ?? '';
      return acc;
    }, {});
    expect(headerProperties['jieyu:layer-meta:TRC_MAIN']).toContain('"orthographyId":"ortho-ar"');
    expect(headerProperties['jieyu:layer-meta:TRC_MAIN']).toContain('"scriptTag":"Arab"');
    expect(headerProperties['jieyu:layer-meta:TRC_MAIN']).toContain('"regionTag":"EG"');
    expect(headerProperties['jieyu:layer-meta:TRC_MAIN']).toContain('"variantTag":"fonipa"');
    expect(headerProperties['jieyu:layer-meta:TRC_MAIN']).toContain('"bridgeId":"xf-ar-latn"');
    expect(headerProperties['jieyu:layer-meta:TRL_CHILD']).toContain('"orthographyId":"ortho-eng"');

    const imported = importFromEaf(xml);
    expect(imported.tierMetadata.get('TRC_MAIN')?.orthographyId).toBe('ortho-ar');
    expect(imported.tierMetadata.get('TRC_MAIN')?.scriptTag).toBe('Arab');
    expect(imported.tierMetadata.get('TRC_MAIN')?.regionTag).toBe('EG');
    expect(imported.tierMetadata.get('TRC_MAIN')?.variantTag).toBe('fonipa');
    expect(imported.tierMetadata.get('TRC_MAIN')?.bridgeId).toBe('xf-ar-latn');
    expect(imported.tierMetadata.get('TRL_CHILD')?.orthographyId).toBe('ortho-eng');
    expect(imported.tierMetadata.get('TRL_CHILD')?.languageId).toBe('eng');
  });

  it('drops unknown tier metadata fields during EAF import downgrade', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <PROPERTY NAME="jieyu:layer-meta:default">{"languageId":"ara","orthographyId":"ortho-ar","scriptTag":"Arab","unknownField":"drop-me","bridgeId":"xf-1"}</PROPERTY>
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0"/>
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000"/>
  </TIME_ORDER>
  <TIER TIER_ID="default">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>مرحبا</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
</ANNOTATION_DOCUMENT>`;

    const imported = importFromEaf(xml);
    expect(imported.tierMetadata.get('default')).toEqual({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      bridgeId: 'xf-1',
    });
  });

  it('exports and re-imports logical timeline project metadata via header properties', () => {
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: 'trc_default' });

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [trc],
      translations: [],
      timelineMetadata: {
        timelineMode: 'document',
        logicalDurationSec: 1800,
        timebaseLabel: 'logical-second',
      },
    });

    expect(xml).toContain('jieyu:project-meta:timeline');

    const imported = importFromEaf(xml);
    expect(imported.timelineMetadata).toEqual({
      timelineMode: 'document',
      logicalDurationSec: 1800,
      timebaseLabel: 'logical-second',
    });
  });

  it('exports PARTICIPANT when speakerId is a free string instead of a speaker entity id', () => {
    const unit = {
      ...makeUnit(),
      speakerId: 'John',
    } as LayerUnitDocType;
    const trc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: 'trc_default' });

    const xml = exportToEaf({
      units: [unit],
      layers: [trc],
      translations: [],
      speakers: [makeSpeaker({ id: 'speaker_john', name: 'John' })],
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const tier = doc.querySelector('TIER[TIER_ID="default"]');
    expect(tier?.getAttribute('PARTICIPANT')).toBe('John');
  });

  it('exports transcription time_subdivision tiers from segment graph with parent ref', () => {
    const defaultTrc = makeLayer({ id: 'trc_default', layerType: 'transcription', key: withEafKeyMeta('trc_default', 'TRC_DEFAULT') });
    const subTrc = makeLayer({
      id: 'trc_sub',
      layerType: 'transcription',
      key: withEafKeyMeta('trc_sub', 'TRC_SUB'),
      name: { eng: 'TRC_SUB', zho: 'TRC_SUB' },
      constraint: 'time_subdivision',
      parentLayerId: defaultTrc.id,
      sortOrder: 1,
      isDefault: false,
    });
    const seg: LayerUnitDocType = {
      id: 'seg_trc_sub',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: subTrc.id,
      startTime: 0.2,
      endTime: 0.8,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    };

    const xml = exportToEaf({
      units: [makeUnit()],
      layers: [defaultTrc, subTrc],
      translations: [makeTranslation({ id: 'utr_default', layerId: defaultTrc.id, unitId: 'utt_1', text: 'main-text' })],
      layerSegments: new Map([[subTrc.id, [seg]]]),
      layerSegmentContents: new Map([[subTrc.id, new Map([[seg.id, {
        id: 'cnt_trc_sub',
        textId: 'text_1',
        segmentId: seg.id,
        layerId: subTrc.id,
        modality: 'text' as const,
        text: 'sub-text',
        sourceType: 'human' as const,
        createdAt: '2026-03-25T00:00:00.000Z',
        updatedAt: '2026-03-25T00:00:00.000Z',
      }]])]]),
    });

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const tier = doc.querySelector('TIER[TIER_ID="TRC_SUB"]');
    expect(tier).not.toBeNull();
    expect(tier?.getAttribute('PARENT_REF')).toBe('TRC_DEFAULT');
    expect(tier?.getAttribute('LINGUISTIC_TYPE_REF')).toBe('translation-subdivision-lt');
    expect(tier?.querySelector('ANNOTATION_VALUE')?.textContent).toBe('sub-text');
  });
});
