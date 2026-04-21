import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerLinkDocType, TranscriptionLayerDocType } from '../db';
import { resolveVoiceDictationTarget } from './voiceDictationRuntime';

function makeLayer(
  id: string,
  layerType: 'transcription' | 'translation',
  extras?: Pick<TranscriptionLayerDocType, 'parentLayerId'>,
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
    ...(layerType === 'transcription' ? (extras ?? {}) : {}),
  } as LayerDocType;
}

function makeLink(id: string, transcriptionLayerKey: string, hostTranscriptionLayerId: string, layerId: string): LayerLinkDocType {
  const now = '2026-04-20T00:00:00.000Z';
  return {
    id,
    transcriptionLayerKey,
    hostTranscriptionLayerId,
    layerId,
    linkType: 'free',
    isPreferred: true,
    createdAt: now,
  };
}

describe('resolveVoiceDictationTarget', () => {
  it('keeps default transcription layer precedence when selected layer is empty', () => {
    const trDefault = makeLayer('tr-default', 'transcription');
    const tlEn = makeLayer('tl-en', 'translation', { parentLayerId: 'tr-default' });

    const resolved = resolveVoiceDictationTarget({
      selectedLayerId: '',
      defaultTranscriptionLayerId: 'tr-default',
      translationLayers: [tlEn],
      layers: [trDefault, tlEn],
    });

    expect(resolved?.targetLayerId).toBe('tr-default');
    expect(resolved?.targetLayer.layerType).toBe('transcription');
  });

  it('resolves host child translation instead of first translation fallback', () => {
    const trEn = makeLayer('tr-en', 'transcription');
    const trFr = makeLayer('tr-fr', 'transcription');
    const tlZh = makeLayer('tl-zh', 'translation');
    const tlFr = makeLayer('tl-fr', 'translation');
    const layerLinks = [
      makeLink('link-zh-en', 'tr-en', 'tr-en', 'tl-zh'),
      makeLink('link-fr-fr', 'tr-fr', 'tr-fr', 'tl-fr'),
    ];

    const resolved = resolveVoiceDictationTarget({
      selectedLayerId: '',
      selectedUnitLayerId: 'tr-fr',
      translationLayers: [tlZh, tlFr],
      layers: [trEn, trFr, tlZh, tlFr],
      layerLinks,
    });

    expect(resolved?.targetLayerId).toBe('tl-fr');
    expect(resolved?.targetLayer.layerType).toBe('translation');
  });
});
