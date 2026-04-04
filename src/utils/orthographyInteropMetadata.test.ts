import { describe, expect, it } from 'vitest';
import type { LayerDocType, OrthographyDocType } from '../db';
import {
  buildOrthographyInteropMetadata,
  parseOrthographyInteropMetadata,
} from './orthographyInteropMetadata';

const NOW = '2026-03-31T00:00:00.000Z';

function makeLayer(overrides: Partial<LayerDocType> = {}): LayerDocType {
  return {
    id: 'layer-1',
    textId: 'text-1',
    key: 'trc_default',
    name: { zho: '转写' },
    layerType: 'transcription',
    languageId: 'ara',
    orthographyId: 'ortho-ar',
    modality: 'text',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as LayerDocType;
}

function makeOrthography(overrides: Partial<OrthographyDocType> = {}): OrthographyDocType {
  return {
    id: 'ortho-ar',
    languageId: 'ara',
    name: { zho: '阿拉伯语' },
    scriptTag: 'Arab',
    regionTag: 'EG',
    variantTag: 'fonipa',
    createdAt: NOW,
    ...overrides,
  } as OrthographyDocType;
}

describe('orthographyInteropMetadata', () => {
  it('builds provider-neutral metadata from layer and orthography snapshot', () => {
    expect(buildOrthographyInteropMetadata(
      makeLayer({ transformId: 'xf-ar-latn' }),
      [makeOrthography()],
    )).toEqual({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      regionTag: 'EG',
      variantTag: 'fonipa',
      transformId: 'xf-ar-latn',
    });
  });

  it('returns undefined when no portable fields are available', () => {
    expect(buildOrthographyInteropMetadata(
      makeLayer({ languageId: '' }),
      [],
    )).toEqual({
      orthographyId: 'ortho-ar',
    });
  });

  it('parses only allowed provider-neutral fields and drops unknown metadata', () => {
    expect(parseOrthographyInteropMetadata({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      regionTag: 'EG',
      variantTag: 'fonipa',
      transformId: 'xf-ar-latn',
      provider: 'custom-eaf-plugin',
      unknownField: 'drop-me',
    })).toEqual({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      regionTag: 'EG',
      variantTag: 'fonipa',
      transformId: 'xf-ar-latn',
    });
  });
});
