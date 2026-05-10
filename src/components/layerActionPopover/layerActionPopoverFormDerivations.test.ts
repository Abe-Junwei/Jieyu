import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../../db';
import {
  buildFormInitializationKey,
  computeContextualParentLayerId,
  computeCreateTranslationHostSeed,
  deriveEditingTranslationLinkState,
} from './layerActionPopoverFormDerivations';

function tx(id: string, key: string, parent?: string): LayerDocType {
  return {
    id,
    key,
    layerType: 'transcription',
    name: { en: key },
    ...(parent ? { parentLayerId: parent } : {}),
  } as unknown as LayerDocType;
}

function tr(id: string, key: string): LayerDocType {
  return {
    id,
    key,
    layerType: 'translation',
    name: { en: key },
  } as unknown as LayerDocType;
}

describe('layerActionPopoverFormDerivations', () => {
  it('buildFormInitializationKey joins stable segments', () => {
    expect(
      buildFormInitializationKey({
        action: 'create-transcription',
        layerId: 'L1',
        contextualParentLayerId: 'P0',
        defaultLanguageId: ' ABC ',
        normalizedDefaultOrthographyId: 'orth',
      }),
    ).toBe('create-transcription::L1::P0::abc::orth');
  });

  it('computeContextualParentLayerId returns independent layer when clicked is independent', () => {
    const independent = [tx('t1', 'T1')];
    const deletable = independent;
    expect(
      computeContextualParentLayerId({
        layerId: 't1',
        deletableLayers: deletable,
        layerLinks: [],
        independentParentLayers: independent,
      }),
    ).toBe('t1');
  });

  it('computeCreateTranslationHostSeed uses single parent when only one independent', () => {
    const only = tx('only', 'O');
    expect(computeCreateTranslationHostSeed([only], '')).toEqual({
      translationHostIds: ['only'],
      preferredTranslationHostId: 'only',
    });
  });

  it('computeCreateTranslationHostSeed uses contextual when in list', () => {
    const a = tx('a', 'A');
    const b = tx('b', 'B');
    expect(computeCreateTranslationHostSeed([a, b], 'b')).toEqual({
      translationHostIds: ['b'],
      preferredTranslationHostId: 'b',
    });
  });

  it('deriveEditingTranslationLinkState reads hosts from links', () => {
    const tHost = tx('host', 'H');
    const trLayer = tr('tr', 'TR');
    const { editingTranslationHostIds, editingPreferredHostId } = deriveEditingTranslationLinkState(
      {
        editingLayer: trLayer,
        deletableLayers: [tHost, trLayer],
        layerLinks: [
          {
            layerId: 'tr',
            transcriptionLayerKey: 'H',
            hostTranscriptionLayerId: 'host',
            isPreferred: true,
            linkType: 'free',
          },
        ],
      },
    );
    expect(editingTranslationHostIds).toEqual(['host']);
    expect(editingPreferredHostId).toBe('host');
  });
});
