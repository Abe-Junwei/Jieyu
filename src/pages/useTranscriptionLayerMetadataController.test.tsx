// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerLinkDocType } from '../db';

const NOW = '2026-04-25T00:00:00.000Z';

const {
  mockGetLayerMetadataAppService,
  mockUpdateLayer,
  mockGetDb,
  mockWithTransaction,
  mockSaveTierDefinition,
  mockNewId,
  mockRemoveBySelector,
  mockInsertLayerLink,
  mockGetTierDefinition,
} = vi.hoisted(() => ({
  mockGetLayerMetadataAppService: vi.fn(),
  mockUpdateLayer: vi.fn(async () => undefined),
  mockGetDb: vi.fn(),
  mockWithTransaction: vi.fn(async (_db: unknown, _mode: unknown, _tables: unknown, callback: () => Promise<void>) => {
    await callback();
  }),
  mockSaveTierDefinition: vi.fn(async () => undefined),
  mockNewId: vi.fn(() => 'link-generated-1'),
  mockRemoveBySelector: vi.fn(async () => undefined),
  mockInsertLayerLink: vi.fn(async () => undefined),
  mockGetTierDefinition: vi.fn(async () => ({
    id: 'trl-1',
    textId: 'text-1',
    key: 'bridge_trl-1',
    name: { zho: '翻译 · 旧名' },
    tierType: 'time-aligned',
    contentType: 'translation',
    createdAt: NOW,
    updatedAt: NOW,
  })),
}));

vi.mock('../app/LayerMetadataAppService', () => ({
  getLayerMetadataAppService: mockGetLayerMetadataAppService,
}));

vi.mock('../db', async () => {
  const actual = await vi.importActual<typeof import('../db')>('../db');
  return {
    ...actual,
    getDb: mockGetDb,
    withTransaction: mockWithTransaction,
  };
});

vi.mock('../services/LinguisticService.tiers', () => ({
  saveTierDefinition: mockSaveTierDefinition,
}));

vi.mock('../utils/transcriptionFormatters', () => ({
  newId: mockNewId,
}));

import { useTranscriptionLayerMetadataController } from './useTranscriptionLayerMetadataController';

function makeLayer(overrides: Partial<LayerDocType> = {}): LayerDocType {
  return {
    id: 'trc-1',
    textId: 'text-1',
    key: 'trc-1',
    layerType: 'transcription',
    name: { zho: '转写' },
    languageId: 'cmn',
    modality: 'text',
    constraint: 'independent_boundary',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as LayerDocType;
}

function makeLink(overrides: Partial<LayerLinkDocType> = {}): LayerLinkDocType {
  return {
    id: 'link-1',
    transcriptionLayerKey: 'trc-1',
    hostTranscriptionLayerId: 'trc-1',
    layerId: 'trl-1',
    linkType: 'free',
    isPreferred: true,
    createdAt: NOW,
    ...overrides,
  } as LayerLinkDocType;
}

describe('useTranscriptionLayerMetadataController', () => {
  it('persists parentTierId and extraParentTierIds for translation host updates', async () => {
    mockUpdateLayer.mockReset();
    mockSaveTierDefinition.mockReset();
    mockNewId.mockReset();
    mockNewId
      .mockReturnValueOnce('link-generated-1')
      .mockReturnValueOnce('link-generated-2');
    mockRemoveBySelector.mockReset();
    mockInsertLayerLink.mockReset();
    mockWithTransaction.mockClear();
    mockGetTierDefinition.mockReset();
    mockGetTierDefinition.mockResolvedValue({
      id: 'trl-1',
      textId: 'text-1',
      key: 'bridge_trl-1',
      name: { zho: '翻译 · 旧名' },
      tierType: 'time-aligned',
      contentType: 'translation',
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockGetLayerMetadataAppService.mockReturnValue({
      updateLayer: mockUpdateLayer,
    });

    mockGetDb.mockResolvedValue({
      dexie: {
        layer_links: {},
        tier_definitions: {
          get: mockGetTierDefinition,
        },
      },
      collections: {
        layer_links: {
          removeBySelector: mockRemoveBySelector,
          insert: mockInsertLayerLink,
        },
      },
    });

    const transcriptionA = makeLayer({ id: 'trc-a', key: 'trc-a', name: { zho: '宿主 A' } });
    const transcriptionB = makeLayer({ id: 'trc-b', key: 'trc-b', name: { zho: '宿主 B' } });
    const translationLayer = makeLayer({
      id: 'trl-1',
      key: 'trl-1',
      layerType: 'translation',
      name: { zho: '翻译 · 旧名' },
      constraint: 'symbolic_association',
    });

    const setLayerCreateMessage = vi.fn();
    const setLayers = vi.fn();
    const setLayerLinks = vi.fn();

    const { result } = renderHook(() => useTranscriptionLayerMetadataController({
      layers: [transcriptionA, transcriptionB, translationLayer],
      layerLinks: [
        makeLink({
          id: 'legacy-link',
          transcriptionLayerKey: 'trc-a',
          hostTranscriptionLayerId: 'trc-a',
          layerId: 'trl-1',
          isPreferred: true,
          linkType: 'free',
        }),
      ],
      setLayerCreateMessage,
      setLayers,
      setLayerLinks,
    }));

    let success = false;
    await act(async () => {
      success = await result.current.updateLayerMetadata('trl-1', {
        languageId: 'eng',
        alias: '新译层',
        hostTranscriptionLayerIds: ['trc-a', 'trc-b'],
        preferredHostTranscriptionLayerId: 'trc-b',
        linkType: 'literal',
      });
    });

    expect(success).toBe(true);
    expect(mockUpdateLayer).toHaveBeenCalledTimes(1);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(mockSaveTierDefinition).toHaveBeenCalledTimes(1);
    expect(mockSaveTierDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'trl-1',
        parentTierId: 'trc-b',
        extraParentTierIds: ['trc-a'],
      }),
      'human',
    );
  });
});
