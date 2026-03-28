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
      db.media_items.clear(),
      db.tier_definitions.clear(),
      db.layer_links.clear(),
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

  it('does not assign utterance speaker from tier participant automatically', async () => {
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
    await db.tier_definitions.put(defaultLayer as never);
    await db.speakers.put({
      id: 'speaker_existing_john',
      name: 'john',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    mockReadFileAsText.mockResolvedValueOnce(`<?xml version="1.0" encoding="UTF-8"?>
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
</ANNOTATION_DOCUMENT>`);

    const { result } = renderHook(() => useImportExport({
      activeTextId: 'text-import',
      getActiveTextId: vi.fn(async () => 'text-import'),
      selectedUtteranceMedia: undefined,
      utterancesOnCurrentMedia: [],
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

    const importedUtterances = await db.utterances.toArray();
    expect(importedUtterances).toHaveLength(1);
    expect(importedUtterances[0]?.speakerId).toBeUndefined();
  });

  it('imports independent transcription tier segments even when no utterances are inserted', async () => {
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
    await db.tier_definitions.bulkPut([defaultLayer as never, independentLayer as never]);
    await db.media_items.put({
      id: 'media-import',
      textId: 'text-import',
      filename: 'demo.wav',
      isOfflineCached: true,
      createdAt: NOW,
    } as never);

    mockReadFileAsText.mockResolvedValueOnce(`<?xml version="1.0" encoding="UTF-8"?>
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
</ANNOTATION_DOCUMENT>`);

    const selectedUtteranceMedia = {
      id: 'media-import',
      textId: 'text-import',
      filename: 'demo.wav',
      isOfflineCached: true,
      createdAt: NOW,
    };

    const { result } = renderHook(() => useImportExport({
      activeTextId: 'text-import',
      getActiveTextId: vi.fn(async () => 'text-import'),
      selectedUtteranceMedia: selectedUtteranceMedia as never,
      utterancesOnCurrentMedia: [],
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
    await db.tier_definitions.bulkPut([defaultLayer as never, independentLayer as never]);

    mockReadFileAsText.mockResolvedValueOnce(`<?xml version="1.0" encoding="UTF-8"?>
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
</ANNOTATION_DOCUMENT>`);

    const setSaveState = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useImportExport({
      activeTextId: 'text-import',
      getActiveTextId: vi.fn(async () => 'text-import'),
      selectedUtteranceMedia: undefined,
      utterancesOnCurrentMedia: [],
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
      '[Import] 跳过独立转写层导入：缺少媒体，无法恢复 segment',
      expect.objectContaining({ tierName: 'Independent Secondary', layerId: independentLayer.id }),
    );
    expect(setSaveState).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringMatching(/独立层语段因缺少媒体而未导入|independent-tier segments because no media was available/i),
    }));

    warnSpy.mockRestore();
  });
});