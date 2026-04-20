import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerLinkDocType } from '../db';
import {
  resolveHostAwareTranslationLayerId,
  resolveHostAwareTranslationLayerIdFromSnapshot,
} from './translationLayerTargetResolver';

function makeLayer(
  id: string,
  layerType: LayerDocType['layerType'],
  extras?: Pick<LayerDocType, 'parentLayerId'>,
): LayerDocType {
  const now = '2026-04-20T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType,
    languageId: layerType === 'translation' ? 'eng' : 'zho',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    ...(extras ?? {}),
  } as LayerDocType;
}

function makeLink(
  id: string,
  layerId: string,
  transcriptionLayerKey: string,
  hostTranscriptionLayerId: string,
  isPreferred = true,
): LayerLinkDocType {
  const now = '2026-04-20T00:00:00.000Z';
  return {
    id,
    layerId,
    transcriptionLayerKey,
    hostTranscriptionLayerId,
    linkType: 'free',
    isPreferred,
    createdAt: now,
  };
}

describe('resolveHostAwareTranslationLayerId', () => {
  it('returns selected translation layer directly when selected layer is translation', () => {
    const translationLayers = [
      makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' }),
      makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' }),
    ];

    const resolved = resolveHostAwareTranslationLayerId({
      selectedLayerId: 'tl-fr',
      selectedUnitLayerId: 'tr-en',
      defaultTranscriptionLayerId: 'tr-en',
      translationLayers,
    });

    expect(resolved).toBe('tl-fr');
  });

  it('resolves host child translation by selected unit layer before default fallback', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription'),
      makeLayer('tr-fr', 'transcription'),
    ];
    const translationLayers = [
      makeLayer('tl-zh', 'translation'),
      makeLayer('tl-fr', 'translation'),
    ];
    const layerLinks = [
      makeLink('link-zh-en', 'tl-zh', 'tr-en', 'tr-en', true),
      makeLink('link-fr-fr', 'tl-fr', 'tr-fr', 'tr-fr', true),
    ];

    const resolved = resolveHostAwareTranslationLayerId({
      selectedLayerId: '',
      selectedUnitLayerId: 'tr-fr',
      defaultTranscriptionLayerId: 'tr-en',
      transcriptionLayers,
      translationLayers,
      layerLinks,
    });

    expect(resolved).toBe('tl-fr');
  });

  it('falls back to first translation layer when no host match exists', () => {
    const translationLayers = [
      makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' }),
      makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' }),
    ];

    const resolved = resolveHostAwareTranslationLayerId({
      selectedLayerId: 'tr-unknown',
      selectedUnitLayerId: 'tr-missing',
      defaultTranscriptionLayerId: 'tr-other',
      translationLayers,
    });

    expect(resolved).toBe('tl-zh');
  });

  it('returns undefined when no host match exists and first-layer fallback is disabled', () => {
    const translationLayers = [
      makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' }),
      makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' }),
    ];

    const resolved = resolveHostAwareTranslationLayerId({
      selectedLayerId: 'tr-unknown',
      selectedUnitLayerId: 'tr-missing',
      defaultTranscriptionLayerId: 'tr-other',
      allowFirstTranslationFallback: false,
      translationLayers,
    });

    expect(resolved).toBeUndefined();
  });

  it('normalizes undefined snapshot fields and resolves host child translation', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription'),
      makeLayer('tr-fr', 'transcription'),
    ];
    const translationLayers = [
      makeLayer('tl-zh', 'translation'),
      makeLayer('tl-fr', 'translation'),
    ];
    const layerLinks = [
      makeLink('link-zh-en', 'tl-zh', 'tr-en', 'tr-en', true),
      makeLink('link-fr-fr', 'tl-fr', 'tr-fr', 'tr-fr', true),
    ];

    const resolved = resolveHostAwareTranslationLayerIdFromSnapshot({
      selectedLayerId: undefined,
      selectedUnitLayerId: 'tr-fr',
      defaultTranscriptionLayerId: undefined,
      translationLayers,
      transcriptionLayers,
      layerLinks,
    });

    expect(resolved).toBe('tl-fr');
  });

  it('resolves multi-host translation when selected host matches a non-preferred link', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription'),
      makeLayer('tr-fr', 'transcription'),
    ];
    const translationLayers = [makeLayer('tl-multi', 'translation')];
    const layerLinks = [
      makeLink('link-a', 'tl-multi', 'tr-en', 'tr-en', true),
      makeLink('link-b', 'tl-multi', 'tr-fr', 'tr-fr', false),
    ];

    const resolved = resolveHostAwareTranslationLayerId({
      selectedLayerId: '',
      selectedUnitLayerId: 'tr-fr',
      defaultTranscriptionLayerId: 'tr-en',
      transcriptionLayers,
      translationLayers,
      layerLinks,
    });

    expect(resolved).toBe('tl-multi');
  });

  it('resolves by preferred host link when translation parentLayerId is empty', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription'),
      makeLayer('tr-fr', 'transcription'),
    ];
    const translationLayers = [
      makeLayer('tl-zh', 'translation'),
      makeLayer('tl-fr', 'translation'),
    ];
    const layerLinks = [
      makeLink('link-zh-en', 'tl-zh', 'tr-en', 'tr-en', true),
      makeLink('link-fr-fr', 'tl-fr', 'tr-fr', 'tr-fr', true),
    ];

    const resolved = resolveHostAwareTranslationLayerId({
      selectedLayerId: '',
      selectedUnitLayerId: 'tr-fr',
      defaultTranscriptionLayerId: 'tr-en',
      transcriptionLayers,
      translationLayers,
      layerLinks,
    });

    expect(resolved).toBe('tl-fr');
  });

  it('resolves legacy key-only host links via transcription key map', () => {
    const transcriptionLayers = [
      makeLayer('tr-en-id', 'transcription'),
      makeLayer('tr-fr-id', 'transcription'),
    ];
    transcriptionLayers[0]!.key = 'tr-en-key';
    transcriptionLayers[1]!.key = 'tr-fr-key';
    const translationLayers = [
      makeLayer('tl-zh', 'translation'),
      makeLayer('tl-fr', 'translation'),
    ];
    const now = '2026-04-20T00:00:00.000Z';
    const layerLinks: LayerLinkDocType[] = [
      {
        id: 'legacy-link-en',
        layerId: 'tl-zh',
        transcriptionLayerKey: 'tr-en-key',
        hostTranscriptionLayerId: 'tr-en-id',
        linkType: 'free',
        isPreferred: true,
        createdAt: now,
      },
      {
        id: 'legacy-link-fr',
        layerId: 'tl-fr',
        transcriptionLayerKey: 'tr-fr-key',
        hostTranscriptionLayerId: 'tr-fr-id',
        linkType: 'free',
        isPreferred: true,
        createdAt: now,
      },
    ];

    const resolved = resolveHostAwareTranslationLayerIdFromSnapshot({
      selectedLayerId: undefined,
      selectedUnitLayerId: 'tr-fr-id',
      defaultTranscriptionLayerId: undefined,
      translationLayers,
      transcriptionLayers,
      layerLinks,
    });

    expect(resolved).toBe('tl-fr');
  });

  it('keeps allowFirstTranslationFallback=false behavior in snapshot helper', () => {
    const translationLayers = [
      makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' }),
      makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' }),
    ];

    const resolved = resolveHostAwareTranslationLayerIdFromSnapshot({
      selectedLayerId: undefined,
      selectedUnitLayerId: 'tr-missing',
      defaultTranscriptionLayerId: undefined,
      allowFirstTranslationFallback: false,
      translationLayers,
    });

    expect(resolved).toBeUndefined();
  });
});
