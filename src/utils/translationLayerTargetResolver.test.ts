import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
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
    const translationLayers = [
      makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' }),
      makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' }),
    ];

    const resolved = resolveHostAwareTranslationLayerId({
      selectedLayerId: '',
      selectedUnitLayerId: 'tr-fr',
      defaultTranscriptionLayerId: 'tr-en',
      translationLayers,
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
    const translationLayers = [
      makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' }),
      makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' }),
    ];

    const resolved = resolveHostAwareTranslationLayerIdFromSnapshot({
      selectedLayerId: undefined,
      selectedUnitLayerId: 'tr-fr',
      defaultTranscriptionLayerId: undefined,
      translationLayers,
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
