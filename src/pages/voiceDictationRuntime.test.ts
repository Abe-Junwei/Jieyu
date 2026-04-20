import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import { resolveVoiceDictationTarget } from './voiceDictationRuntime';

function makeLayer(
  id: string,
  layerType: 'transcription' | 'translation',
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
    const tlZh = makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' });
    const tlFr = makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' });

    const resolved = resolveVoiceDictationTarget({
      selectedLayerId: '',
      selectedUnitLayerId: 'tr-fr',
      translationLayers: [tlZh, tlFr],
      layers: [trEn, trFr, tlZh, tlFr],
    });

    expect(resolved?.targetLayerId).toBe('tl-fr');
    expect(resolved?.targetLayer.layerType).toBe('translation');
  });
});
