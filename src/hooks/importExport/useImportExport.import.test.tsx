// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { db, getDb, isLexemeEntry } from '../../db';
import type { LayerDocType } from '../../db';
import { useImportExport } from './useImportExport';

const mockReadFileAsText = vi.hoisted(() => vi.fn());
const mockIngestTextFile = vi.hoisted(() => vi.fn());
const mockImportFromTextGrid = vi.hoisted(() => vi.fn());
const mockValidateLayerTierConsistency = vi.hoisted(() => vi.fn(async () => []));
const mockSyncLayerToTier = vi.hoisted(() => vi.fn(async () => undefined));
const mockRepairExistingLayerConstraints = vi.hoisted(() =>
  vi.fn((layers: LayerDocType[]) => ({ layers, repairs: [] })),
);
const mockValidateExistingLayerConstraints = vi.hoisted(() => vi.fn(() => []));

vi.mock('../ui/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock('../../services/EafService', async () => {
  const actual = await vi.importActual('../../services/EafService');
  return {
    ...actual,
    readFileAsText: mockReadFileAsText,
  };
});

vi.mock('../../utils/textIngestion', () => ({
  ingestTextFile: mockIngestTextFile,
}));

vi.mock('../../services/TextGridService', async () => {
  const actual = await vi.importActual('../../services/TextGridService');
  return {
    ...actual,
    importFromTextGrid: mockImportFromTextGrid,
  };
});

vi.mock('../../services/TierBridgeService', () => ({
  validateLayerTierConsistency: mockValidateLayerTierConsistency,
  syncLayerToTier: mockSyncLayerToTier,
}));

vi.mock('../../services/LayerConstraintService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/LayerConstraintService')>();
  return {
    repairExistingLayerConstraints: mockRepairExistingLayerConstraints,
    validateExistingLayerConstraints: mockValidateExistingLayerConstraints,
    hasRepairPersistableLayerDiff: actual.hasRepairPersistableLayerDiff,
  };
});

const NOW = '2026-03-27T00:00:00.000Z';

async function seedProjectLayer(layer: LayerDocType): Promise<void> {
  const j = await getDb();
  await j.collections.layers.insert(layer);
}

async function seedProjectLayers(layers: LayerDocType[]): Promise<void> {
  const j = await getDb();
  await j.collections.layers.bulkInsert(layers);
}

describe('useImportExport - import success under stop-write', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.texts.clear(),
      db.media_items.clear(),
      db.orthographies.clear(),
      db.orthography_bridges.clear(),
      db.tier_definitions.clear(),
      db.layer_links.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.lexemes.clear(),
      db.user_notes.clear(),
      db.audit_logs.clear(),
      db.speakers.clear(),
    ]);
    vi.clearAllMocks();
  });

  afterEach(() => {});

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
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [
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
    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot,
        setSaveState,
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.textgrid', { type: 'text/plain' }),
      );
    });

    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(1);
    expect(await db.layer_units.where('unitType').equals('segment').count()).toBe(1);
    expect(await db.layer_unit_contents.count()).toBe(2);
    expect(await db.layer_unit_contents.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: defaultLayer.id,
          text: 'imported transcription',
        }),
      ]),
    );
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'done',
      }),
    );
  });

  it('persists logical timeline metadata back onto the active text after import', async () => {
    await db.texts.put({
      id: 'text-import',
      title: { zho: '导入项目' },
      metadata: {},
      createdAt: NOW,
      updatedAt: NOW,
    });

    const defaultLayer: LayerDocType = {
      id: 'trc-default-import-meta',
      textId: 'text-import',
      key: 'trc_default_import_meta',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [
        {
          startTime: 0,
          endTime: 1,
          transcription: 'imported transcription',
        },
      ],
      additionalTiers: new Map(),
      transcriptionTierName: undefined,
      timelineMetadata: {
        timelineMode: 'document',
        logicalDurationSec: 1800,
        timebaseLabel: 'logical-second',
      },
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.textgrid', { type: 'text/plain' }),
      );
    });

    const savedText = await db.texts.get('text-import');
    expect(savedText?.metadata).toEqual(
      expect.objectContaining({
        timelineMode: 'document',
        logicalDurationSec: 1,
        timebaseLabel: 'logical-second',
      }),
    );
  });

  it('caps imported logical timeline metadata to established acoustic duration', async () => {
    const j = await getDb();
    await j.dexie.texts.put({
      id: 'text-import-cap',
      title: { zho: '声学项目' },
      metadata: { timelineMode: 'media' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await j.dexie.media_items.put({
      id: 'media-import-cap',
      textId: 'text-import-cap',
      filename: 'clip.wav',
      duration: 200,
      details: { audioBlob: new Blob(['x'], { type: 'audio/wav' }), timelineKind: 'acoustic' },
      isOfflineCached: true,
      createdAt: NOW,
    });

    const defaultLayer: LayerDocType = {
      id: 'trc-default-import-cap',
      textId: 'text-import-cap',
      key: 'trc_default_import_cap',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [{ startTime: 0, endTime: 1, transcription: 'x' }],
      additionalTiers: new Map(),
      transcriptionTierName: undefined,
      timelineMetadata: {
        timelineMode: 'document',
        logicalDurationSec: 1800,
        timebaseLabel: 'logical-second',
      },
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import-cap',
        getActiveTextId: vi.fn(async () => 'text-import-cap'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    expect(await j.dexie.media_items.where('textId').equals('text-import-cap').count()).toBe(1);

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.textgrid', { type: 'text/plain' }),
      );
    });

    const savedText = await j.dexie.texts.get('text-import-cap');
    expect(savedText?.metadata).toEqual(
      expect.objectContaining({
        logicalDurationSec: 200,
        timebaseLabel: 'logical-second',
      }),
    );
  });

  it('tightens greenfield imported logical metadata to parsed units max end', async () => {
    const j = await getDb();
    await j.dexie.texts.put({
      id: 'text-import-greenfield',
      title: { zho: '空项目' },
      metadata: {},
      createdAt: NOW,
      updatedAt: NOW,
    });

    const defaultLayer: LayerDocType = {
      id: 'trc-default-import-greenfield',
      textId: 'text-import-greenfield',
      key: 'trc_default_import_greenfield',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [{ startTime: 0, endTime: 42, transcription: 'x' }],
      additionalTiers: new Map(),
      transcriptionTierName: undefined,
      timelineMetadata: {
        timelineMode: 'document',
        logicalDurationSec: 1800,
        timebaseLabel: 'logical-second',
      },
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import-greenfield',
        getActiveTextId: vi.fn(async () => 'text-import-greenfield'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.textgrid', { type: 'text/plain' }),
      );
    });

    const savedText = await j.dexie.texts.get('text-import-greenfield');
    expect(savedText?.metadata).toEqual(
      expect.objectContaining({
        logicalDurationSec: 42,
        timebaseLabel: 'logical-second',
      }),
    );
  });

  it('applies active orthography transform before saving imported transcription text', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-transform-import',
      textId: 'text-import',
      key: 'trc_default_transform_import',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'eng',
      orthographyId: 'orth_target_import',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    await db.orthographies.bulkPut([
      {
        id: 'orth_source_import',
        languageId: 'eng',
        name: { eng: 'Source Import' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_target_import',
        languageId: 'eng',
        name: { eng: 'Target Import' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] as never[]);
    await db.orthography_bridges.put({
      id: 'orthxfm_import_trc',
      sourceOrthographyId: 'orth_source_import',
      targetOrthographyId: 'orth_target_import',
      engine: 'table-map',
      rules: {
        mappings: [{ from: 'sh', to: 's' }],
      },
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [
        {
          startTime: 0,
          endTime: 1,
          transcription: 'shaam',
        },
      ],
      additionalTiers: new Map(),
      transcriptionTierName: 'Surface',
      tierMetadata: new Map([['Surface', { orthographyId: 'orth_source_import' }]]),
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.textgrid', { type: 'text/plain' }),
      );
    });

    const contents = await db.layer_unit_contents
      .where('layerId')
      .equals(defaultLayer.id)
      .toArray();
    expect(contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: defaultLayer.id,
          text: 'saam',
        }),
      ]),
    );
  });

  it('keeps only source text in a dedicated source layer when import strategy is preserve-source', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-preserve-source',
      textId: 'text-import',
      key: 'trc_default_preserve_source',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'eng',
      orthographyId: 'orth_target_import',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    await db.orthographies.bulkPut([
      {
        id: 'orth_source_import',
        languageId: 'eng',
        name: { eng: 'Source Import' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_target_import',
        languageId: 'eng',
        name: { eng: 'Target Import' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] as never[]);
    await db.orthography_bridges.put({
      id: 'orthxfm_import_trc_preserve_source',
      sourceOrthographyId: 'orth_source_import',
      targetOrthographyId: 'orth_target_import',
      engine: 'table-map',
      rules: {
        mappings: [{ from: 'sh', to: 's' }],
      },
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [
        {
          startTime: 0,
          endTime: 1,
          transcription: 'shaam',
        },
      ],
      additionalTiers: new Map(),
      transcriptionTierName: 'Surface',
      tierMetadata: new Map([
        ['Surface', { orthographyId: 'orth_source_import', languageId: 'eng' }],
      ]),
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.textgrid', { type: 'text/plain' }),
        'preserve-source',
      );
    });

    const defaultContents = await db.layer_unit_contents
      .where('layerId')
      .equals(defaultLayer.id)
      .toArray();
    expect(defaultContents).toEqual([
      expect.objectContaining({
        layerId: defaultLayer.id,
        text: '',
      }),
    ]);

    const sourceLayer = (await (await getDb()).collections.layers.find().exec()).find(
      (layer) =>
        layer.id !== defaultLayer.id &&
        layer.textId === 'text-import' &&
        layer.orthographyId === 'orth_source_import',
    );

    expect(sourceLayer).toBeTruthy();
    expect(sourceLayer?.name.und).toContain('原文');

    const sourceContents = sourceLayer
      ? await db.layer_unit_contents.where('layerId').equals(sourceLayer.id).toArray()
      : [];
    expect(sourceContents).toEqual([
      expect.objectContaining({
        layerId: sourceLayer?.id,
        text: 'shaam',
      }),
    ]);
  });

  it('keeps source text and bridged target text when import strategy is preserve-source-and-bridge', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-preserve-both',
      textId: 'text-import',
      key: 'trc_default_preserve_both',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'eng',
      orthographyId: 'orth_target_import',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    await db.orthographies.bulkPut([
      {
        id: 'orth_source_import',
        languageId: 'eng',
        name: { eng: 'Source Import' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_target_import',
        languageId: 'eng',
        name: { eng: 'Target Import' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] as never[]);
    await db.orthography_bridges.put({
      id: 'orthxfm_import_trc_preserve_both',
      sourceOrthographyId: 'orth_source_import',
      targetOrthographyId: 'orth_target_import',
      engine: 'table-map',
      rules: {
        mappings: [{ from: 'sh', to: 's' }],
      },
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [
        {
          startTime: 0,
          endTime: 1,
          transcription: 'shaam',
        },
      ],
      additionalTiers: new Map(),
      transcriptionTierName: 'Surface',
      tierMetadata: new Map([
        ['Surface', { orthographyId: 'orth_source_import', languageId: 'eng' }],
      ]),
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.textgrid', { type: 'text/plain' }),
        'preserve-source-and-bridge',
      );
    });

    const defaultContents = await db.layer_unit_contents
      .where('layerId')
      .equals(defaultLayer.id)
      .toArray();
    expect(defaultContents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: defaultLayer.id,
          text: 'saam',
        }),
      ]),
    );

    const sourceLayer = (await (await getDb()).collections.layers.find().exec()).find(
      (layer) =>
        layer.id !== defaultLayer.id &&
        layer.textId === 'text-import' &&
        layer.orthographyId === 'orth_source_import',
    );

    expect(sourceLayer).toBeTruthy();

    const sourceContents = sourceLayer
      ? await db.layer_unit_contents.where('layerId').equals(sourceLayer.id).toArray()
      : [];
    expect(sourceContents).toEqual([
      expect.objectContaining({
        layerId: sourceLayer?.id,
        text: 'shaam',
      }),
    ]);
  });

  it('applies active orthography transform before saving imported translation text', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-transform-translation',
      textId: 'text-import',
      key: 'trc_default_transform_translation',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translationLayer: LayerDocType = {
      id: 'trl-existing-transform-layer',
      textId: 'text-import',
      key: 'trl_existing_transform_layer',
      name: { zho: '注释层', eng: 'Gloss' },
      layerType: 'translation',
      languageId: 'eng',
      orthographyId: 'orth_target_translation',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayers([defaultLayer, translationLayer]);
    await db.orthographies.bulkPut([
      {
        id: 'orth_source_translation',
        languageId: 'eng',
        name: { eng: 'Source Translation' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'orth_target_translation',
        languageId: 'eng',
        name: { eng: 'Target Translation' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] as never[]);
    await db.orthography_bridges.put({
      id: 'orthxfm_import_translation',
      sourceOrthographyId: 'orth_source_translation',
      targetOrthographyId: 'orth_target_translation',
      engine: 'table-map',
      rules: {
        mappings: [{ from: 'sh', to: 's' }],
      },
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: 'dummy textgrid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [
        {
          startTime: 0,
          endTime: 1,
          transcription: 'source unit',
        },
      ],
      additionalTiers: new Map([['Gloss', [{ startTime: 0, endTime: 1, text: 'shaam' }]]]),
      transcriptionTierName: undefined,
      tierMetadata: new Map([
        ['Gloss', { orthographyId: 'orth_source_translation', languageId: 'eng' }],
      ]),
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer, translationLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'gloss.textgrid', { type: 'text/plain' }),
      );
    });

    const contents = await db.layer_unit_contents
      .where('layerId')
      .equals(translationLayer.id)
      .toArray();
    expect(contents).toEqual([
      expect.objectContaining({
        layerId: translationLayer.id,
        text: 'saam',
      }),
    ]);
  });

  it('assigns unit speaker from tier PARTICIPANT on EAF import', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-speaker-import',
      textId: 'text-import',
      key: 'trc_default_speaker_import',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    await db.speakers.put({
      id: 'speaker_existing_john',
      name: 'john',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt" PARTICIPANT="John">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>Hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.eaf', { type: 'application/xml' }),
      );
    });

    const importedUnitUnits = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(importedUnitUnits).toHaveLength(1);
    expect(importedUnitUnits[0]?.speakerId).toBe('speaker_existing_john');
  });

  it('restores Jieyu notes tier as user_notes instead of a translation layer', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-notes-import',
      textId: 'text-import',
      key: 'trc_default_notes_import',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>Hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="notes" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="en">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>imported note</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const setSaveState = vi.fn();
    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState,
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'notes.eaf', { type: 'application/xml' }),
      );
    });

    const units = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(units).toHaveLength(1);
    const notes = await db.user_notes.toArray();
    expect(notes).toEqual([
      expect.objectContaining({
        targetType: 'unit',
        targetId: units[0]?.id,
        content: expect.objectContaining({ default: 'imported note' }),
      }),
    ]);
    const jieyuDb = await getDb();
    const allLayers = await jieyuDb.collections.layers.find().exec();
    const notesLayers = allLayers.filter((layer) => {
      const eng =
        typeof layer.name === 'object' && layer.name !== null
          ? ((layer.name as Record<string, string>).eng ?? '')
          : '';
      return eng.toLowerCase() === 'notes';
    });
    expect(notesLayers).toHaveLength(0);
  });

  it('imports independent transcription tier segments even when no units are inserted', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-empty-import',
      textId: 'text-import',
      key: 'trc_default_empty_import',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const independentLayer: LayerDocType = {
      id: 'trc-independent-import',
      textId: 'text-import',
      key: 'trc_independent_import',
      name: { zho: '独立转写层', eng: 'Independent Secondary' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      constraint: 'independent_boundary',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayers([defaultLayer, independentLayer]);
    await db.media_items.put({
      id: 'media-import',
      textId: 'text-import',
      filename: 'demo.wav',
      isOfflineCached: true,
      createdAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1800" />
  </TIME_ORDER>
  <TIER TIER_ID="Default Transcription" LINGUISTIC_TYPE_REF="default-lt" />
  <TIER TIER_ID="Independent Secondary" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>standalone tier text</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const selectedUnitMedia = {
      id: 'media-import',
      textId: 'text-import',
      filename: 'demo.wav',
      isOfflineCached: true,
      createdAt: NOW,
    };

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: selectedUnitMedia as never,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer, independentLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'empty-main.eaf', { type: 'application/xml' }),
      );
    });

    const importedSegments = await db.layer_units
      .where('layerId')
      .equals(independentLayer.id)
      .toArray();
    const importedContents = await db.layer_unit_contents
      .where('layerId')
      .equals(independentLayer.id)
      .toArray();

    expect(importedSegments).toHaveLength(1);
    expect(importedContents).toHaveLength(1);
    expect(importedContents[0]?.text).toBe('standalone tier text');
  });

  it('reports skipped independent-tier segments when media is unavailable', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-no-media',
      textId: 'text-import',
      key: 'trc_default_no_media',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const independentLayer: LayerDocType = {
      id: 'trc-independent-no-media',
      textId: 'text-import',
      key: 'trc_independent_no_media',
      name: { zho: '独立转写层', eng: 'Independent Secondary' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      constraint: 'independent_boundary',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayers([defaultLayer, independentLayer]);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1800" />
  </TIME_ORDER>
  <TIER TIER_ID="Default Transcription" LINGUISTIC_TYPE_REF="default-lt" />
  <TIER TIER_ID="Independent Secondary" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>standalone tier text</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const setSaveState = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer, independentLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState,
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'no-media.eaf', { type: 'application/xml' }),
      );
    });

    expect(await db.layer_units.where('layerId').equals(independentLayer.id).count()).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      '[useImportExport.additionalTierHandlers]',
      'skipped independent transcription tier import: missing media, cannot restore segments',
      expect.objectContaining({ tierName: 'Independent Secondary', layerId: independentLayer.id }),
    );
    expect(setSaveState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'done',
        message: expect.stringMatching(
          /独立层语段因缺少媒体而未导入|independent-tier segments because no media was available/i,
        ),
      }),
    );

    warnSpy.mockRestore();
  });

  it('import records host recovery warning when multi-host cannot be reconstructed', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-host-warning',
      textId: 'text-import',
      key: 'trc_default_host_warning',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="TRC_MAIN" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="TRL_CHILD" LINGUISTIC_TYPE_REF="translation-lt" PARENT_REF="TRC_MAIN">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>bonjour</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const setSaveState = vi.fn();
    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState,
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'host-warning.eaf', { type: 'application/xml' }),
      );
    });

    expect(setSaveState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'done',
        message: expect.stringMatching(/恢复了单宿主链路|single-host links only/i),
      }),
    );
  });

  it('persists tokens from FLEx secondary interlinear-text onto independent-boundary segments', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-flex-tokens',
      textId: 'text-import',
      key: 'trc_default_flex_tokens',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const independentLayer: LayerDocType = {
      id: 'trc-independent-flex-tokens',
      textId: 'text-import',
      key: 'trc_independent_flex_tokens',
      name: { zho: '附加层', eng: 'Extra Layer' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      constraint: 'independent_boundary',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayers([defaultLayer, independentLayer]);
    await db.media_items.put({
      id: 'media-flex-tokens',
      textId: 'text-import',
      filename: 'demo.wav',
      isOfflineCached: true,
      createdAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<document version="2">
  <interlinear-text guid="it1">
    <item type="title" lang="en">Primary</item>
    <paragraphs>
      <paragraph guid="pg1">
        <phrases>
          <phrase guid="p1" begin-time-offset="0" end-time-offset="1">
            <item type="txt" lang="en">hello</item>
          </phrase>
        </phrases>
      </paragraph>
    </paragraphs>
  </interlinear-text>
  <interlinear-text guid="it2">
    <item type="title" lang="en">Extra Layer</item>
    <paragraphs>
      <paragraph guid="pg2">
        <phrases>
          <phrase guid="p2" begin-time-offset="0" end-time-offset="1">
            <item type="txt" lang="en">extra</item>
            <words>
              <word guid="w1">
                <item type="txt" lang="en">extra</item>
                <item type="gls" lang="en">EXTRA</item>
              </word>
            </words>
          </phrase>
        </phrases>
      </paragraph>
    </paragraphs>
  </interlinear-text>
</document>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: {
          id: 'media-flex-tokens',
          textId: 'text-import',
          filename: 'demo.wav',
          isOfflineCached: true,
          createdAt: NOW,
        } as never,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer, independentLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.flextext', { type: 'application/xml' }),
      );
    });

    const segments = await db.layer_units.where('layerId').equals(independentLayer.id).toArray();
    expect(segments).toHaveLength(1);
    const tokens = await db.unit_tokens.where('unitId').equals(segments[0]!.id).toArray();
    expect(tokens).toEqual([
      expect.objectContaining({
        form: { default: 'extra' },
        gloss: { eng: 'EXTRA' },
        lexemeId: expect.any(String),
      }),
    ]);
    const lexeme = await db.lexemes.get(tokens[0]!.lexemeId!);
    expect(lexeme && isLexemeEntry(lexeme) ? lexeme.entry.headword : undefined).toBe('extra');
    expect(
      lexeme && isLexemeEntry(lexeme) ? (lexeme.entry.senses?.length ?? 0) : 0,
    ).toBeGreaterThanOrEqual(1);
    const links = await db.token_lexeme_links
      .where('[targetType+targetId]')
      .equals(['token', tokens[0]!.id])
      .toArray();
    expect(links).toHaveLength(1);
    expect(links[0]?.lexemeId).toBe(tokens[0]!.lexemeId);
  });

  it('persists TRS section topics and speaker dialect/accent', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-trs-meta',
      textId: 'text-import',
      key: 'trc_default_trs_meta',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Trans SYSTEM "trans-14.dtd">
<Trans program="test" version="1">
  <Speakers>
    <Speaker id="spk1" name="Alice" xml:lang="eng" dialect="coastal" accent="rhotic" check="yes" scope="local" />
  </Speakers>
  <Episode>
    <Section type="report" topic="intro" startTime="0.000" endTime="1.000">
      <Turn speaker="spk1" startTime="0.000" endTime="1.000">
        <Sync time="0.000"/>
        hello there
      </Turn>
    </Section>
  </Episode>
</Trans>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'demo.trs', { type: 'application/xml' }),
      );
    });

    const speakers = await db.speakers.toArray();
    expect(speakers).toEqual([
      expect.objectContaining({
        name: 'Alice',
        dialect: 'coastal',
        accent: 'rhotic',
        languageIds: ['eng'],
      }),
    ]);
    const units = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(units).toHaveLength(1);
    expect(units[0]?.speakerId).toBe(speakers[0]?.id);
    const notes = await db.user_notes.toArray();
    expect(notes).toEqual([
      expect.objectContaining({
        targetType: 'unit',
        targetId: units[0]?.id,
        category: 'topic',
        content: expect.objectContaining({ default: 'intro' }),
      }),
    ]);
  });

  it('persists EAF word-tier tokens and secondary MEDIA_DESCRIPTOR metadata', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-eaf-tokens',
      textId: 'text-import',
      key: 'trc_default_eaf_tokens',
      name: { zho: '默认转写层' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    await db.media_items.put({
      id: 'media-eaf-meta',
      textId: 'text-import',
      filename: 'primary.wav',
      isOfflineCached: true,
      details: { source: 'upload' },
      createdAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="primary.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./primary.wav" />
    <MEDIA_DESCRIPTOR MEDIA_URL="video.mp4" MIME_TYPE="video/mp4" RELATIVE_MEDIA_URL="./video.mp4" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello world</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="words-lt" PARENT_REF="utterance">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="w2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>world</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="words-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: {
          id: 'media-eaf-meta',
          textId: 'text-import',
          filename: 'primary.wav',
          isOfflineCached: true,
          details: { source: 'upload' },
          createdAt: NOW,
        } as never,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'words.eaf', { type: 'application/xml' }),
      );
    });

    const media = await db.media_items.get('media-eaf-meta');
    expect(media?.details).toEqual(
      expect.objectContaining({
        source: 'upload',
        secondaryMedia: [
          expect.objectContaining({
            filename: 'video.mp4',
            mimeType: 'video/mp4',
          }),
        ],
      }),
    );
    const units = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(units).toHaveLength(1);
    const tokens = (await db.unit_tokens.where('unitId').equals(units[0]!.id).toArray()).sort(
      (a, b) => a.tokenIndex - b.tokenIndex,
    );
    expect(tokens.map((token) => token.form.default)).toEqual(['hello', 'world']);
    expect(
      tokens.every((token) => typeof token.lexemeId === 'string' && token.lexemeId.length > 0),
    ).toBe(true);
    const lexemes = (await db.lexemes.toArray()).filter(isLexemeEntry);
    expect(lexemes.map((lexeme) => lexeme.entry.headword).sort()).toEqual(['hello', 'world']);
  });

  it('imports independent-boundary translation tier segments by overlap, not exact unit timing', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-default-ind-trl',
      textId: 'text-import',
      key: 'trc_default_ind_trl',
      name: { zho: '默认转写层', eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translationLayer: LayerDocType = {
      id: 'trl-independent-import',
      textId: 'text-import',
      key: 'trl_independent_import',
      name: { zho: '英文翻译', eng: 'English' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      constraint: 'independent_boundary',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayers([defaultLayer, translationLayer]);
    await db.media_items.put({
      id: 'media-ind-trl',
      textId: 'text-import',
      filename: 'demo.wav',
      isOfflineCached: true,
      createdAt: NOW,
    } as never);

    mockIngestTextFile.mockResolvedValueOnce({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="2000" />
    <TIME_SLOT TIME_SLOT_ID="ts3" TIME_VALUE="1500" />
    <TIME_SLOT TIME_SLOT_ID="ts4" TIME_VALUE="2000" />
  </TIME_ORDER>
  <TIER TIER_ID="Default Transcription" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello world</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="English" LINGUISTIC_TYPE_REF="translation-independent-lt" PARENT_REF="Default Transcription">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts3">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a3" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4">
        <ANNOTATION_VALUE>world</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-independent-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });

    const { result } = renderHook(() =>
      useImportExport({
        activeTextId: 'text-import',
        getActiveTextId: vi.fn(async () => 'text-import'),
        selectedUnitMedia: {
          id: 'media-ind-trl',
          textId: 'text-import',
          filename: 'demo.wav',
          isOfflineCached: true,
          createdAt: NOW,
        } as never,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers: [defaultLayer, translationLayer],
        translations: [],
        defaultTranscriptionLayerId: defaultLayer.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'independent-translation.eaf', { type: 'application/xml' }),
      );
    });

    const importedSegments = await db.layer_units
      .where('layerId')
      .equals(translationLayer.id)
      .toArray();
    const importedContents = await db.layer_unit_contents
      .where('layerId')
      .equals(translationLayer.id)
      .toArray();

    expect(importedSegments).toHaveLength(2);
    expect(importedSegments.map((segment) => segment.startTime).sort()).toEqual([1, 1.5]);
    expect(importedContents.map((content) => content.text).sort()).toEqual(['hello', 'world']);
  });

  function eafFile(name: string, body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="${name}" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./${name}" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts3" TIME_VALUE="10000" />
    <TIME_SLOT TIME_SLOT_ID="ts4" TIME_VALUE="11000" />
  </TIME_ORDER>
  ${body}
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="word-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="assoc-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="cv-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" CONTROLLED_VOCABULARY_REF="pos" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;
  }

  function renderImporter(textId: string, layers: LayerDocType[], prompt = false) {
    const setSaveState = vi.fn();
    const rendered = renderHook(() =>
      useImportExport({
        activeTextId: textId,
        getActiveTextId: vi.fn(async () => textId),
        selectedUnitMedia: undefined,
        unitsOnCurrentMedia: [],
        anchors: [],
        layers,
        translations: [],
        defaultTranscriptionLayerId: layers[0]?.id,
        loadSnapshot: vi.fn(async () => undefined),
        setSaveState,
        ...(prompt ? { promptForEafTierRoles: true } : {}),
      }),
    );
    return { ...rendered, setSaveState };
  }

  it('updates the same unit when the same annotation is imported again', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-reimport',
      textId: 'text-reimport',
      key: 'trc_reimport',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    const utterance = (text: string) =>
      eafFile(
        'speech.wav',
        `<TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>${text}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>`,
      );
    mockIngestTextFile.mockResolvedValueOnce({
      text: utterance('Hello'),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const { result } = renderImporter('text-reimport', [defaultLayer]);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'once.eaf', { type: 'application/xml' }),
      );
    });
    const first = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(first).toHaveLength(1);
    mockIngestTextFile.mockResolvedValueOnce({
      text: utterance('Hello again'),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'twice.eaf', { type: 'application/xml' }),
      );
    });
    const again = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(again).toHaveLength(1);
    expect(again[0]?.id).toBe(first[0]?.id);
    const relatedIds = new Set(
      (await db.layer_units.where('textId').equals('text-reimport').toArray()).map((row) => row.id),
    );
    const contents = (await db.layer_unit_contents.toArray()).filter(
      (row) => row.unitId !== undefined && relatedIds.has(row.unitId),
    );
    expect(contents.some((row) => row.text === 'Hello again')).toBe(true);
  });

  it('does not update another text that happens to use the same annotation id', async () => {
    const layerFor = (textId: string): LayerDocType => ({
      id: `trc-${textId}`,
      textId,
      key: `trc_${textId}`,
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const layerA = layerFor('text-a');
    const layerB = layerFor('text-b');
    await seedProjectLayers([layerA, layerB]);
    const xml = (text: string) =>
      eafFile(
        'speech.wav',
        `<TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>${text}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>`,
      );
    mockIngestTextFile.mockResolvedValueOnce({
      text: xml('keep'),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const first = renderImporter('text-a', [layerA]);
    await act(async () => {
      await first.result.current.handleImportFile(
        new File(['x'], 'a.eaf', { type: 'application/xml' }),
      );
    });
    mockIngestTextFile.mockResolvedValueOnce({
      text: xml('other'),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const second = renderImporter('text-b', [layerB]);
    await act(async () => {
      await second.result.current.handleImportFile(
        new File(['x'], 'b.eaf', { type: 'application/xml' }),
      );
    });
    const unitsA = await db.layer_units.where('textId').equals('text-a').toArray();
    const unitIdsA = new Set(unitsA.map((row) => row.id));
    const contentsA = (await db.layer_unit_contents.toArray()).filter(
      (row) => row.unitId !== undefined && unitIdsA.has(row.unitId),
    );
    expect(contentsA.some((row) => row.text === 'keep')).toBe(true);
    expect(contentsA.some((row) => row.text === 'other')).toBe(false);
  });

  it('binds an existing media row by filename and skips a missing file', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-media',
      textId: 'text-media',
      key: 'trc_media',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    await db.media_items.put({
      id: 'media-speech',
      textId: 'text-media',
      filename: 'Speech.wav',
      isOfflineCached: true,
      createdAt: NOW,
    } as never);
    mockIngestTextFile.mockResolvedValueOnce({
      text: eafFile(
        'speech.wav',
        `<TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>Hello</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>`,
      ),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const bound = renderImporter('text-media', [defaultLayer]);
    await act(async () => {
      await bound.result.current.handleImportFile(
        new File(['x'], 'bound.eaf', { type: 'application/xml' }),
      );
    });
    expect(await db.media_items.count()).toBe(1);
    const units = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(units[0]?.mediaId).toBe('media-speech');

    await db.layer_units.clear();
    await db.layer_unit_contents.clear();
    await db.media_items.clear();
    mockIngestTextFile.mockResolvedValueOnce({
      text: eafFile(
        'missing.wav',
        `<TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>Hello</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>`,
      ),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const missing = renderImporter('text-media', [defaultLayer]);
    await act(async () => {
      await missing.result.current.handleImportFile(
        new File(['x'], 'missing.eaf', { type: 'application/xml' }),
      );
    });
    expect(await db.media_items.count()).toBe(0);
    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(1);
    const done = missing.setSaveState.mock.calls.find((call) => call[0]?.kind === 'done');
    expect(String(done?.[0]?.message)).toContain('missing.wav');
  });

  it('reuses JIEYU_LEXEME_ID and parks a controlled vocabulary on the parent', async () => {
    await db.token_lexeme_links.clear();
    const defaultLayer: LayerDocType = {
      id: 'trc-lex',
      textId: 'text-lex',
      key: 'trc_lex',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    await db.lexemes.put({
      id: 'lex-hello',
      entry: {
        id: 'lex-hello',
        headword: 'hello',
        senses: [{ id: 'sense-hello', headwordTranslations: [{ text: 'hello', langCode: 'und' }] }],
      },
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    mockIngestTextFile.mockResolvedValueOnce({
      text: eafFile(
        'speech.wav',
        `<TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="word-lt" PARENT_REF="TRC">
          <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1" JIEYU_LEXEME_ID="lex-hello">
              <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
            </REF_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="pos" LINGUISTIC_TYPE_REF="cv-lt" PARENT_REF="TRC">
          <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="c1" ANNOTATION_REF="a1">
              <ANNOTATION_VALUE>noun</ANNOTATION_VALUE>
            </REF_ANNOTATION>
          </ANNOTATION>
        </TIER>`,
      ),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const { result } = renderImporter('text-lex', [defaultLayer]);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'lex.eaf', { type: 'application/xml' }),
      );
    });
    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(1);
    expect(await db.lexemes.count()).toBe(1);
    const links = await db.token_lexeme_links.toArray();
    expect(links.map((row) => row.lexemeId)).toEqual(['lex-hello']);
    const notes = await db.user_notes.toArray();
    expect(notes).toEqual([
      expect.objectContaining({
        category: 'linguistic',
        content: expect.objectContaining({ default: 'controlled-vocabulary: noun' }),
      }),
    ]);
  });

  it('attaches a translation by annotation ref even when its times do not overlap', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-ref',
      textId: 'text-ref',
      key: 'trc_ref',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    mockIngestTextFile.mockResolvedValueOnce({
      text: eafFile(
        'speech.wav',
        `<TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="trl" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="TRC">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="t1" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4" ANNOTATION_REF="a1">
              <ANNOTATION_VALUE>translated</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>`,
      ),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const { result } = renderImporter('text-ref', [defaultLayer]);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'ref.eaf', { type: 'application/xml' }),
      );
    });
    const contents = await db.layer_unit_contents.toArray();
    expect(contents.some((row) => row.text === 'translated')).toBe(true);
  });

  it('asks for tier roles before writing a foreign file with two independent tiers', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-prompt',
      textId: 'text-prompt',
      key: 'trc_prompt',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    mockIngestTextFile.mockResolvedValue({
      text: eafFile(
        'speech.wav',
        `<TIER TIER_ID="TRC" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="word-lt" PARENT_REF="TRC">
          <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1">
              <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
            </REF_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="free" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>hi</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>`,
      ),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const { result } = renderImporter('text-prompt', [defaultLayer], true);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'roles.eaf', { type: 'application/xml' }),
      );
    });
    expect(await db.layer_units.count()).toBe(0);
    const dialog = result.current.eafTierRoleDialog;
    expect(dialog?.isOpen).toBe(true);
    expect(dialog?.tiers.map((tier) => tier.tierId)).toEqual(['TRC', 'free']);
    const roles = Object.fromEntries((dialog?.tiers ?? []).map((tier) => [tier.tierId, tier.role]));
    await act(async () => {
      await dialog?.onConfirm(roles);
    });
    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(1);
    const tokens = await db.unit_tokens.toArray();
    expect(tokens.map((row) => row.form)).toEqual([{ default: 'hello' }]);
  });

  it('asks for TextGrid tier roles and keeps the default split after confirm', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-grid',
      textId: 'text-grid',
      key: 'trc_grid',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    mockIngestTextFile.mockResolvedValue({
      text: 'grid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValue({
      units: [{ startTime: 0, endTime: 1, transcription: 'hello' }],
      additionalTiers: new Map([['free', [{ startTime: 0, endTime: 1, text: 'hi' }]]]),
      transcriptionTierName: 'utterance',
      tierMetadata: new Map(),
    });
    const { result } = renderImporter('text-grid', [defaultLayer], true);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'two.textgrid', { type: 'text/plain' }),
      );
    });
    expect(await db.layer_units.count()).toBe(0);
    const dialog = result.current.eafTierRoleDialog;
    expect(dialog?.isOpen).toBe(true);
    expect(dialog?.tiers.map((tier) => tier.tierId)).toEqual(['utterance', 'free']);
    const roles = Object.fromEntries((dialog?.tiers ?? []).map((tier) => [tier.tierId, tier.role]));
    await act(async () => {
      await dialog?.onConfirm(roles);
    });
    const contents = await db.layer_unit_contents.toArray();
    expect(contents.map((row) => row.text)).toEqual(expect.arrayContaining(['hello', 'hi']));
  });

  it('writes a two-tier TextGrid immediately when the confirm switch is off', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-grid-off',
      textId: 'text-grid-off',
      key: 'trc_grid_off',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    mockIngestTextFile.mockResolvedValue({
      text: 'grid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValue({
      units: [{ startTime: 0, endTime: 1, transcription: 'hello' }],
      additionalTiers: new Map([['free', [{ startTime: 0, endTime: 1, text: 'hi' }]]]),
      transcriptionTierName: 'utterance',
      tierMetadata: new Map(),
    });
    const { result } = renderImporter('text-grid-off', [defaultLayer]);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'two.textgrid', { type: 'text/plain' }),
      );
    });
    expect(result.current.eafTierRoleDialog?.isOpen).not.toBe(true);
    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(1);
    const contents = await db.layer_unit_contents.toArray();
    expect(contents.map((row) => row.text)).toEqual(expect.arrayContaining(['hello', 'hi']));
  });

  it('reports appended-without-id only when the text already has segments', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-append',
      textId: 'text-append',
      key: 'trc_append',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    mockIngestTextFile.mockResolvedValue({
      text: 'grid',
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    mockImportFromTextGrid.mockReturnValue({
      units: [{ startTime: 0, endTime: 1, transcription: 'hello' }],
      additionalTiers: new Map(),
      transcriptionTierName: 'utterance',
      tierMetadata: new Map(),
    });
    const { result, setSaveState } = renderImporter('text-append', [defaultLayer]);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'once.textgrid', { type: 'text/plain' }),
      );
    });
    const mentionsAppend = (message: string) =>
      message.includes('追加') || message.includes('appended');
    const firstDone = setSaveState.mock.calls.find((call) => call[0]?.kind === 'done');
    expect(mentionsAppend(String(firstDone?.[0]?.message ?? ''))).toBe(false);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'twice.textgrid', { type: 'text/plain' }),
      );
    });
    const secondDone = setSaveState.mock.calls.filter((call) => call[0]?.kind === 'done').at(-1);
    expect(mentionsAppend(String(secondDone?.[0]?.message ?? ''))).toBe(true);
    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(2);
  });

  it('does not ask for tier roles on a TRS file', async () => {
    const defaultLayer: LayerDocType = {
      id: 'trc-trs',
      textId: 'text-trs',
      key: 'trc_trs',
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await seedProjectLayer(defaultLayer);
    mockIngestTextFile.mockResolvedValue({
      text: `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="test" version="1">
  <Speakers><Speaker id="spk1" name="Alice" /></Speakers>
  <Episode>
    <Section type="report" startTime="0" endTime="1">
      <Turn speaker="spk1" startTime="0" endTime="1">
        <Sync time="0"/>hello
      </Turn>
    </Section>
  </Episode>
</Trans>`,
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const { result } = renderImporter('text-trs', [defaultLayer], true);
    await act(async () => {
      await result.current.handleImportFile(
        new File(['x'], 'talk.trs', { type: 'application/xml' }),
      );
    });
    expect(result.current.eafTierRoleDialog?.isOpen).not.toBe(true);
    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(1);
  });

  it('updates a flextext phrase by guid on the same text only', async () => {
    const layerFor = (textId: string): LayerDocType => ({
      id: `trc-${textId}`,
      textId,
      key: `trc_${textId}`,
      name: { eng: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const layerA = layerFor('text-flex-a');
    const layerB = layerFor('text-flex-b');
    await seedProjectLayers([layerA, layerB]);
    const flex = (text: string) => `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <interlinear-text>
    <paragraphs><paragraph><phrases>
      <phrase guid="phrase-1" begin-time-offset="0" end-time-offset="1">
        <item type="txt" lang="en">${text}</item>
      </phrase>
    </phrases></paragraph></paragraphs>
  </interlinear-text>
</document>`;
    mockIngestTextFile.mockResolvedValueOnce({
      text: flex('hello'),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const first = renderImporter('text-flex-a', [layerA]);
    await act(async () => {
      await first.result.current.handleImportFile(
        new File(['x'], 'a.flextext', { type: 'application/xml' }),
      );
    });
    mockIngestTextFile.mockResolvedValueOnce({
      text: flex('hello again'),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    await act(async () => {
      await first.result.current.handleImportFile(
        new File(['x'], 'a2.flextext', { type: 'application/xml' }),
      );
    });
    const onA = await db.layer_units.where('textId').equals('text-flex-a').toArray();
    const utterancesA = onA.filter(
      (row) => row.unitType === 'unit' || row.parentUnitId === undefined,
    );
    expect(utterancesA.filter((row) => row.unitType !== 'segment')).toHaveLength(1);
    const idsA = new Set(onA.map((row) => row.id));
    const contentsA = (await db.layer_unit_contents.toArray()).filter(
      (row) => row.unitId !== undefined && idsA.has(row.unitId),
    );
    expect(contentsA.some((row) => row.text === 'hello again')).toBe(true);
    expect(contentsA.some((row) => row.text === 'hello')).toBe(false);

    mockIngestTextFile.mockResolvedValueOnce({
      text: flex('other text'),
      detectedEncoding: 'utf-8',
      confidence: 'high' as const,
    });
    const second = renderImporter('text-flex-b', [layerB]);
    await act(async () => {
      await second.result.current.handleImportFile(
        new File(['x'], 'b.flextext', { type: 'application/xml' }),
      );
    });
    const contentsAfter = (await db.layer_unit_contents.toArray()).filter(
      (row) => row.unitId !== undefined && idsA.has(row.unitId),
    );
    expect(contentsAfter.some((row) => row.text === 'hello again')).toBe(true);
    expect(contentsAfter.some((row) => row.text === 'other text')).toBe(false);
  });
});
