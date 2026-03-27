// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { db } from '../db';
import type { LayerDocType } from '../db';
import { useImportExport } from './useImportExport';

const mockReadFileAsText = vi.hoisted(() => vi.fn());
const mockImportFromTextGrid = vi.hoisted(() => vi.fn());
const mockValidateLayerTierConsistency = vi.hoisted(() => vi.fn(async () => []));
const mockRepairExistingLayerConstraints = vi.hoisted(() => vi.fn((layers: LayerDocType[]) => ({ layers, repairs: [] })));
const mockValidateExistingLayerConstraints = vi.hoisted(() => vi.fn(() => []));

vi.mock('./useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock('../services/EafService', async () => {
  const actual = await vi.importActual('../services/EafService');
  return {
    ...actual,
    readFileAsText: mockReadFileAsText,
  };
});

vi.mock('../services/TextGridService', async () => {
  const actual = await vi.importActual('../services/TextGridService');
  return {
    ...actual,
    importFromTextGrid: mockImportFromTextGrid,
  };
});

vi.mock('../services/TierBridgeService', () => ({
  validateLayerTierConsistency: mockValidateLayerTierConsistency,
}));

vi.mock('../services/LayerConstraintService', () => ({
  repairExistingLayerConstraints: mockRepairExistingLayerConstraints,
  validateExistingLayerConstraints: mockValidateExistingLayerConstraints,
}));

const NOW = '2026-03-27T00:00:00.000Z';

describe('useImportExport - import success under stop-write', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.texts.clear(),
      db.tier_definitions.clear(),
      db.utterances.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
      db.audit_logs.clear(),
      db.speakers.clear(),
    ]);
    vi.clearAllMocks();
  });

  afterEach(() => {
  });

  it('imports transcription text through canonical LayerUnit write path', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-import',
      textId: 'text-import',
      key: 'trc_default_import',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.tier_definitions.put(defaultLayer as never);

    mockReadFileAsText.mockResolvedValueOnce('dummy textgrid');
    mockImportFromTextGrid.mockReturnValueOnce({
      utterances: [
        {
          startTime: 0,
          endTime: 1,
          transcription: 'imported transcription',
        },
      ],
      additionalTiers: new Map(),
      transcriptionTierName: undefined,
    });

    const loadSnapshot = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const { result } = renderHook(() => useImportExport({
      activeTextId: 'text-import',
      getActiveTextId: vi.fn(async () => 'text-import'),
      selectedUtteranceMedia: undefined,
      utterancesOnCurrentMedia: [],
      anchors: [],
      layers: [defaultLayer],
      translations: [],
      defaultTranscriptionLayerId: defaultLayer.id,
      loadSnapshot,
      setSaveState,
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.textgrid', { type: 'text/plain' }));
    });

    expect(await db.utterances.count()).toBe(1);
    expect(await db.layer_units.where('unitType').equals('segment').count()).toBe(1);
    expect(await db.layer_unit_contents.count()).toBe(1);
    expect(await db.layer_unit_contents.toArray()).toEqual([
      expect.objectContaining({
        layerId: defaultLayer.id,
        text: 'imported transcription',
      }),
    ]);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
    }));
  });
});