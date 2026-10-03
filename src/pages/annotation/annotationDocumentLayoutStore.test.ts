import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type LayerDocType } from '../../db';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import { EMPTY_ANNOTATION_DOCUMENT_LAYOUT } from './annotationIgtLines';
import {
  commitAnnotationDocumentLayout,
  loadAnnotationDocumentLayout,
  readAnnotationDocumentLayout,
  saveAnnotationDocumentLayout,
  saveAnnotationTranslationLayerChoice,
} from './annotationDocumentLayoutStore';
import { ensureAnnotationLiteralLayer } from './ensureAnnotationLiteralLayer';
import { writeAnnotationUnitLayerText } from './writeAnnotationFormsToSurface';

const now = '2026-09-30T00:00:00.000Z';

function layer(
  partial: Pick<LayerDocType, 'id' | 'layerType' | 'languageId'> & { key?: string },
): LayerDocType {
  return {
    id: partial.id,
    textId: 'text-1',
    key: partial.key ?? partial.id,
    name: { eng: partial.id },
    layerType: partial.layerType,
    languageId: partial.languageId,
    modality: 'text',
    acceptsAudio: false,
    constraint:
      partial.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe('annotation document layout', () => {
  beforeEach(async () => {
    await Promise.all([
      db.texts.clear(),
      db.layer_links.clear(),
      db.tier_definitions.clear(),
      db.layer_unit_contents.clear(),
      db.layer_units.clear(),
      db.unit_tokens.clear(),
    ]);
    await db.texts.add({
      id: 'text-1',
      title: { und: 'Project' },
      metadata: { characterVariantLines: "ʔ='" },
      createdAt: now,
      updatedAt: now,
    });
  });

  it('reads an empty layout from missing metadata and keeps other text metadata', async () => {
    expect(readAnnotationDocumentLayout(undefined)).toEqual(EMPTY_ANNOTATION_DOCUMENT_LAYOUT);
    expect(await loadAnnotationDocumentLayout('text-1')).toEqual(EMPTY_ANNOTATION_DOCUMENT_LAYOUT);
    const stored = {
      ...EMPTY_ANNOTATION_DOCUMENT_LAYOUT,
      added: ['literal' as const],
      languageByLine: { gloss: 'eng' },
      literalLayerId: 'layer-lit',
    };
    await saveAnnotationDocumentLayout('text-1', stored);
    expect(await loadAnnotationDocumentLayout('text-1')).toEqual(stored);
    expect((await db.texts.get('text-1'))?.metadata).toEqual(
      expect.objectContaining({ characterVariantLines: "ʔ='" }),
    );
  });

  it('creates a translation layer for literal text and does not write tokens', async () => {
    await LayerTierUnifiedService.createLayer(
      layer({ id: 'tx-mvm', layerType: 'transcription', languageId: 'mvm' }),
    );
    await LayerTierUnifiedService.createLayer(
      layer({ id: 'ft-eng', layerType: 'translation', languageId: 'eng', key: 'trl-eng' }),
    );
    await LinguisticService.units.saveBatch([
      {
        id: 'unit-1',
        textId: 'text-1',
        mediaId: 'media-1',
        unitType: 'unit',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'ta' },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.unit_tokens.add({
      id: 'tok-1',
      textId: 'text-1',
      unitId: 'unit-1',
      form: { default: 'ta' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });

    const created = await ensureAnnotationLiteralLayer({
      textId: 'text-1',
      workingLanguageIds: ['eng'],
      literalLayerId: '',
    });
    expect(created).toEqual(expect.any(String));
    expect(created).not.toBe('literal');
    expect(created).not.toBe('ft-eng');
    const again = await ensureAnnotationLiteralLayer({
      textId: 'text-1',
      workingLanguageIds: ['eng'],
      literalLayerId: created ?? '',
    });
    expect(again).toBe(created);

    const layers = await LinguisticService.layers.listByTextId('text-1');
    const literal = layers.find((item) => item.id === created);
    expect(literal?.layerType).toBe('translation');
    expect(literal?.languageId).toBe('eng');
    const link = await db.layer_links
      .where('layerId')
      .equals(created ?? '')
      .first();
    expect(link?.hostTranscriptionLayerId).toBe('tx-mvm');
    expect(link?.linkType).not.toBe('literal');

    const written = await writeAnnotationUnitLayerText({
      textId: 'text-1',
      unitId: 'unit-1',
      text: 'boy',
      languageId: 'eng',
      layerIds: [created ?? ''],
      createLayerId: created ?? '',
    });
    expect(written).toBe('written');
    const contents = await LinguisticService.timeline.listUnitTexts('unit-1');
    expect(contents.find((row) => row.layerId === created)?.text).toBe('boy');
    expect((await db.unit_tokens.get('tok-1'))?.form).toEqual({ default: 'ta' });
  });

  it('does not add the literal line when no transcription host exists', async () => {
    const next = await commitAnnotationDocumentLayout({
      textId: 'text-1',
      workingLanguageIds: ['eng'],
      next: { ...EMPTY_ANNOTATION_DOCUMENT_LAYOUT, added: ['literal'] },
    });
    expect(next).toBeNull();
    expect(await loadAnnotationDocumentLayout('text-1')).toEqual(EMPTY_ANNOTATION_DOCUMENT_LAYOUT);
    expect(await db.tier_definitions.count()).toBe(0);
  });

  it('remembers the free translation layer without dropping the literal layer', async () => {
    await saveAnnotationDocumentLayout('text-1', {
      ...EMPTY_ANNOTATION_DOCUMENT_LAYOUT,
      literalLayerId: 'layer-lit',
      added: ['literal'],
    });
    await saveAnnotationTranslationLayerChoice('text-1', 'ft-eng');
    const loaded = await loadAnnotationDocumentLayout('text-1');
    expect(loaded.translationLayerId).toBe('ft-eng');
    expect(loaded.literalLayerId).toBe('layer-lit');
    expect(loaded.added).toEqual(['literal']);
  });

  it('creates a translation layer when a working language line is added', async () => {
    await LayerTierUnifiedService.createLayer(
      layer({ id: 'tx-mvm', layerType: 'transcription', languageId: 'mvm' }),
    );
    const next = await commitAnnotationDocumentLayout({
      textId: 'text-1',
      workingLanguageIds: ['eng'],
      next: {
        ...EMPTY_ANNOTATION_DOCUMENT_LAYOUT,
        languageKeys: ['translation:lang:eng'],
      },
    });
    expect(next?.languageKeys[0]).toMatch(/^translation:/);
    expect(next?.languageKeys[0]).not.toBe('translation:lang:eng');
    const layers = await LinguisticService.layers.listByTextId('text-1');
    expect(
      layers.some((item) => item.layerType === 'translation' && item.languageId === 'eng'),
    ).toBe(true);
    expect(await db.layer_units.count()).toBe(0);
  });

  it('does not create a translation layer in the transcription language', async () => {
    await LayerTierUnifiedService.createLayer(
      layer({ id: 'tx-mvm', layerType: 'transcription', languageId: 'mvm' }),
    );
    const next = await commitAnnotationDocumentLayout({
      textId: 'text-1',
      workingLanguageIds: ['mvm'],
      next: {
        ...EMPTY_ANNOTATION_DOCUMENT_LAYOUT,
        languageKeys: ['translation:lang:mvm'],
      },
    });
    expect(next).toBeNull();
    const layers = await LinguisticService.layers.listByTextId('text-1');
    expect(layers.filter((item) => item.layerType === 'translation')).toEqual([]);
    expect(await loadAnnotationDocumentLayout('text-1')).toEqual(EMPTY_ANNOTATION_DOCUMENT_LAYOUT);
  });
});
