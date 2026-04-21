// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { db, getDb } from '../db';
import type { LayerDocType } from '../db';
import { useImportExport } from './useImportExport';

const mockReadFileAsText = vi.hoisted(() => vi.fn());
const mockIngestTextFile = vi.hoisted(() => vi.fn());
const mockImportFromTextGrid = vi.hoisted(() => vi.fn());
const mockValidateLayerTierConsistency = vi.hoisted(() => vi.fn(async () => []));
const mockSyncLayerToTier = vi.hoisted(() => vi.fn(async () => undefined));
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

vi.mock('../utils/textIngestion', () => ({
  ingestTextFile: mockIngestTextFile,
}));

vi.mock('../services/TextGridService', async () => {
  const actual = await vi.importActual('../services/TextGridService');
  return {
    ...actual,
    importFromTextGrid: mockImportFromTextGrid,
  };
});

vi.mock('../services/TierBridgeService', () => ({
  validateLayerTierConsistency: mockValidateLayerTierConsistency,
  syncLayerToTier: mockSyncLayerToTier,
}));

vi.mock('../services/LayerConstraintService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/LayerConstraintService')>();
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
    await seedProjectLayer(defaultLayer);

    mockIngestTextFile.mockResolvedValueOnce({ text: 'dummy textgrid', detectedEncoding: 'utf-8', confidence: 'high' as const });
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
    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.textgrid', { type: 'text/plain' }));
    });

    expect(await db.layer_units.where('unitType').equals('unit').count()).toBe(1);
    expect(await db.layer_units.where('unitType').equals('segment').count()).toBe(1);
    expect(await db.layer_unit_contents.count()).toBe(2);
    expect(await db.layer_unit_contents.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layerId: defaultLayer.id,
        text: 'imported transcription',
      }),
    ]));
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
    }));
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

    mockIngestTextFile.mockResolvedValueOnce({ text: 'dummy textgrid', detectedEncoding: 'utf-8', confidence: 'high' as const });
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

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.textgrid', { type: 'text/plain' }));
    });

    const savedText = await db.texts.get('text-import');
    expect(savedText?.metadata).toEqual(expect.objectContaining({
      timelineMode: 'document',
      logicalDurationSec: 1800,
      timebaseLabel: 'logical-second',
    }));
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

    mockIngestTextFile.mockResolvedValueOnce({ text: 'dummy textgrid', detectedEncoding: 'utf-8', confidence: 'high' as const });
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
        ['Surface', { orthographyId: 'orth_source_import' }],
      ]),
    });

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.textgrid', { type: 'text/plain' }));
    });

    const contents = await db.layer_unit_contents.where('layerId').equals(defaultLayer.id).toArray();
    expect(contents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layerId: defaultLayer.id,
        text: 'saam',
      }),
    ]));
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

    mockIngestTextFile.mockResolvedValueOnce({ text: 'dummy textgrid', detectedEncoding: 'utf-8', confidence: 'high' as const });
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

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.textgrid', { type: 'text/plain' }), 'preserve-source');
    });

    const defaultContents = await db.layer_unit_contents.where('layerId').equals(defaultLayer.id).toArray();
    expect(defaultContents).toEqual([
      expect.objectContaining({
        layerId: defaultLayer.id,
        text: '',
      }),
    ]);

    const sourceLayer = (await (await getDb()).collections.layers.find().exec())
      .find((layer) => layer.id !== defaultLayer.id && layer.textId === 'text-import' && layer.orthographyId === 'orth_source_import');

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

    mockIngestTextFile.mockResolvedValueOnce({ text: 'dummy textgrid', detectedEncoding: 'utf-8', confidence: 'high' as const });
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

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.textgrid', { type: 'text/plain' }), 'preserve-source-and-bridge');
    });

    const defaultContents = await db.layer_unit_contents.where('layerId').equals(defaultLayer.id).toArray();
    expect(defaultContents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layerId: defaultLayer.id,
        text: 'saam',
      }),
    ]));

    const sourceLayer = (await (await getDb()).collections.layers.find().exec())
      .find((layer) => layer.id !== defaultLayer.id && layer.textId === 'text-import' && layer.orthographyId === 'orth_source_import');

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

    mockIngestTextFile.mockResolvedValueOnce({ text: 'dummy textgrid', detectedEncoding: 'utf-8', confidence: 'high' as const });
    mockImportFromTextGrid.mockReturnValueOnce({
      units: [
        {
          startTime: 0,
          endTime: 1,
          transcription: 'source unit',
        },
      ],
      additionalTiers: new Map([
        ['Gloss', [{ startTime: 0, endTime: 1, text: 'shaam' }]],
      ]),
      transcriptionTierName: undefined,
      tierMetadata: new Map([
        ['Gloss', { orthographyId: 'orth_source_translation', languageId: 'eng' }],
      ]),
    });

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'gloss.textgrid', { type: 'text/plain' }));
    });

    const contents = await db.layer_unit_contents.where('layerId').equals(translationLayer.id).toArray();
    expect(contents).toEqual([
      expect.objectContaining({
        layerId: translationLayer.id,
        text: 'saam',
      }),
    ]);
  });

  it('does not assign unit speaker from tier participant automatically', async () => {
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

    mockIngestTextFile.mockResolvedValueOnce({ text: `<?xml version="1.0" encoding="UTF-8"?>
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
</ANNOTATION_DOCUMENT>`, detectedEncoding: 'utf-8', confidence: 'high' as const });

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.eaf', { type: 'application/xml' }));
    });

    const importedUnitUnits = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(importedUnitUnits).toHaveLength(1);
    expect(importedUnitUnits[0]?.speakerId).toBeUndefined();
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

    mockIngestTextFile.mockResolvedValueOnce({ text: `<?xml version="1.0" encoding="UTF-8"?>
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
</ANNOTATION_DOCUMENT>`, detectedEncoding: 'utf-8', confidence: 'high' as const });

    const selectedUnitMedia = {
      id: 'media-import',
      textId: 'text-import',
      filename: 'demo.wav',
      isOfflineCached: true,
      createdAt: NOW,
    };

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'empty-main.eaf', { type: 'application/xml' }));
    });

    const importedSegments = await db.layer_units.where('layerId').equals(independentLayer.id).toArray();
    const importedContents = await db.layer_unit_contents.where('layerId').equals(independentLayer.id).toArray();

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

    mockIngestTextFile.mockResolvedValueOnce({ text: `<?xml version="1.0" encoding="UTF-8"?>
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
</ANNOTATION_DOCUMENT>`, detectedEncoding: 'utf-8', confidence: 'high' as const });

    const setSaveState = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'no-media.eaf', { type: 'application/xml' }));
    });

    expect(await db.layer_units.where('layerId').equals(independentLayer.id).count()).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[Import\] (?:跳过独立转写层导入：缺少媒体，无法恢复 segment|Skipped independent transcription tier import: missing media, cannot restore segments)/),
      expect.objectContaining({ tierName: 'Independent Secondary', layerId: independentLayer.id }),
    );
    expect(setSaveState).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringMatching(/独立层语段因缺少媒体而未导入|independent-tier segments because no media was available/i),
    }));

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

    mockIngestTextFile.mockResolvedValueOnce({ text: `<?xml version="1.0" encoding="UTF-8"?>
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
</ANNOTATION_DOCUMENT>`, detectedEncoding: 'utf-8', confidence: 'high' as const });

    const setSaveState = vi.fn();
    const { result } = renderHook(() => useImportExport({
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
    }));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'host-warning.eaf', { type: 'application/xml' }));
    });

    expect(setSaveState).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringMatching(/恢复了单宿主链路|single-host links only/i),
    }));
  });
});