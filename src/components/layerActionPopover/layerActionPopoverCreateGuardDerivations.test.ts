import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../../db';
import {
  buildLayerActionPopoverCreateGuardBundle,
  buildLayerActionPopoverTitleLabel,
} from './layerActionPopoverCreateGuardDerivations';

const baseMessages = {
  createTranscriptionLayer: 'ct',
  createTranslationLayer: 'ctr',
  editLayerMetadata: 'em',
  deleteLayer: 'del',
  translationCreateUnavailable: 'tu',
  transcriptionCreateUnavailable: 'tcu',
  translationLanguageRequired: 'tlr',
  transcriptionLanguageRequired: 'tslr',
  requiredPrefix: 'req:',
} as const;

describe('layerActionPopoverCreateGuardDerivations', () => {
  it('buildLayerActionPopoverTitleLabel maps actions', () => {
    expect(buildLayerActionPopoverTitleLabel('create-transcription', baseMessages as never)).toBe(
      'ct',
    );
    expect(buildLayerActionPopoverTitleLabel('create-translation', baseMessages as never)).toBe(
      'ctr',
    );
    expect(
      buildLayerActionPopoverTitleLabel('edit-transcription-metadata', baseMessages as never),
    ).toBe('em');
    expect(buildLayerActionPopoverTitleLabel('delete', baseMessages as never)).toBe('del');
  });

  it('buildLayerActionPopoverCreateGuardBundle exposes language flags', () => {
    const deletableLayers: LayerDocType[] = [];
    const bundle = buildLayerActionPopoverCreateGuardBundle({
      action: 'create-transcription',
      deletableLayers,
      resolvedLanguageId: '',
      alias: '',
      modality: 'text',
      constraint: 'symbolic_association',
      translationHostIds: [],
      preferredTranslationHostId: '',
      independentParentLayers: [],
      resolvedTranscriptionParentLayerId: '',
      messages: baseMessages as never,
      createFailureMessage: '',
    });
    expect(bundle.hasValidLanguage).toBe(false);
    expect(bundle.showConstraintSelector).toBe(false);
  });
});
