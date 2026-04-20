// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { AnchorDocType, LayerDocType, MediaItemDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { db } from '../db';
import { putTestUnitAsLayerUnit } from '../db/putTestUnitAsLayerUnit';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../i18n';
import { LinguisticService } from '../services/LinguisticService';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

const { mockLogWarn, mockLogError } = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../observability/logger', () => ({
  createLogger: vi.fn(() => ({
    warn: mockLogWarn,
    error: mockLogError,
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { LocalWhisperSttProvider } from '../services/stt/LocalWhisperSttProvider';
import * as sttModule from '../services/stt';
import { resetCommercialSttRuntimeSnapshotForTests, setCommercialSttRuntimeSnapshot } from '../services/stt/voiceCommercialSttRuntime';
import { useTranscriptionUnitActions } from './useTranscriptionUnitActions';

function makeUnit(id: string, startTime: number, endTime: number): LayerUnitDocType {
  const now = new Date().toISOString();
  return {
    id,
    mediaId: 'm1',
    textId: 't1',
    startTime,
    endTime,
    transcription: { default: id },
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation' }): LayerDocType {
  const now = new Date().toISOString();
  const { id, layerType, ...rest } = overrides;
  return {
    textId: 't1',
    key: id,
    name: { zho: id, eng: id },
    layerType,
    languageId: layerType === 'translation' ? 'eng' : 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...rest,
    id,
  } as LayerDocType;
}

describe('useTranscriptionUnitActions - batch operations', () => {
  beforeEach(async () => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
    resetCommercialSttRuntimeSnapshotForTests();
    await db.open();
    await Promise.all([
      db.embeddings.clear(),
      db.tier_definitions.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
      db.media_items.clear(),
    ]);
    mockLogWarn.mockReset();
    mockLogError.mockReset();
  });

  afterEach(() => {
    cleanup();
    resetCommercialSttRuntimeSnapshotForTests();
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('offsetSelectedTimes should block overlap and not push undo', async () => {
    const pushUndo = vi.fn();
    const setSaveState = vi.fn();
    let unitsState = [
      makeUnit('u1', 0, 1),
      makeUnit('u2', 1.1, 2),
    ];

    const setUnits = vi.fn((updater: ((prev: LayerUnitDocType[]) => LayerUnitDocType[]) | LayerUnitDocType[]) => {
      unitsState = typeof updater === 'function' ? updater(unitsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.offsetSelectedTimes(new Set(['u1']), 0.5);
    });

    expect(pushUndo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: expect.stringContaining('重叠'),
      errorMeta: expect.objectContaining({ category: 'validation', action: '前置校验' }),
    }));
    expect(unitsState[0]?.startTime).toBe(0);
    expect(unitsState[0]?.endTime).toBe(1);
  });

  it('scaleSelectedTimes should push undo once and update selected ranges', async () => {
    const pushUndo = vi.fn();
    const setSaveState = vi.fn();
    const saveBatchSpy = vi.spyOn(LinguisticService, 'saveUnitsBatch').mockResolvedValue();

    let unitsState = [
      makeUnit('u1', 1, 2),
      makeUnit('u2', 2.2, 3.2),
      makeUnit('u3', 6, 7),
    ];

    const setUnits = vi.fn((updater: ((prev: LayerUnitDocType[]) => LayerUnitDocType[]) | LayerUnitDocType[]) => {
      unitsState = typeof updater === 'function' ? updater(unitsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.scaleSelectedTimes(new Set(['u1', 'u2']), 2, 1);
    });

    expect(pushUndo).toHaveBeenCalledTimes(1);
    expect(pushUndo).toHaveBeenCalledWith('批量时间缩放');
    expect(saveBatchSpy).toHaveBeenCalledTimes(1);
    expect(unitsState.find((u) => u.id === 'u1')?.startTime).toBe(1);
    expect(unitsState.find((u) => u.id === 'u1')?.endTime).toBe(3);
    expect(unitsState.find((u) => u.id === 'u2')?.startTime).toBe(3.4);
    expect(unitsState.find((u) => u.id === 'u2')?.endTime).toBe(5.4);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('splitByRegex should return validation error for invalid pattern without pushUndo', async () => {
    const pushUndo = vi.fn();
    const setSaveState = vi.fn();
    const unitsState = [makeUnit('u1', 0, 3)];

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: () => 'a,b,c',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.splitByRegex(new Set(['u1']), '[', 'g');
    });

    expect(pushUndo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '正则表达式无效。',
    }));
  });

  it('saveUnitLayerText should strip legacy speaker linkage fields', async () => {
    const now = new Date().toISOString();
    // Seed unit (needed for V2 sync) | 种子 unit（V2 sync 需要）
    const unit = makeUnit('utt-1', 0, 1);
    await putTestUnitAsLayerUnit(db, unit, 'trc-host');

    // Seed LayerUnit canonical entries directly.
    await db.layer_units.put({
      id: 'seg_v2_utt1',
      textId: 't1',
      mediaId: 'media1',
      layerId: 'tr-layer-1',
      unitType: 'segment',
      parentUnitId: 'utt-1',
      rootUnitId: 'utt-1',
      startTime: 0,
      endTime: 1,
      createdAt: now,
      updatedAt: now,
    } as never);
    await db.layer_unit_contents.put({
      id: 'utr-legacy',   // V2 content ID 与 V1 ID 相同（backfill 策略）
      textId: 't1',
      unitId: 'seg_v2_utt1',
      layerId: 'tr-layer-1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'old',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    } as never);

    const pushUndo = vi.fn();
    const setSaveState = vi.fn();
    const setTranslations = vi.fn();

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map([
        ['tr-layer-1', {
          id: 'tr-layer-1',
          textId: 't1',
          key: 'tr_1',
          name: { zho: '翻译层1' },
          layerType: 'translation',
          languageId: 'en',
          modality: 'text',
          createdAt: now,
          updatedAt: now,
        }],
      ]) as never,
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: [] },
      unitsOnCurrentMediaRef: { current: [] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations,
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUnitLayerText('utt-1', 'updated', 'tr-layer-1');
    });

    // Phase 1+2: 检查 V2 layer_segment_contents 而非 unit_texts | Check V2 instead of V1
    const v2Content = await db.layer_unit_contents.get('utr-legacy') as Record<string, unknown> | undefined;

    expect(v2Content?.text).toBe('updated');
    expect(v2Content && 'recordedBySpeakerId' in v2Content).toBe(false);
    expect(pushUndo).toHaveBeenCalledWith('编辑翻译文本');
  });

  it('saveUnitText should invalidate unit embeddings for the default transcription layer', async () => {
    const now = new Date().toISOString();
    const unit = makeUnit('utt-default', 0, 1);

    await putTestUnitAsLayerUnit(db, unit, 'trc-default');
    await db.embeddings.put({
      id: 'unit::utt-default::model::v1',
      sourceType: 'unit',
      sourceId: 'utt-default',
      model: 'model',
      modelVersion: 'v1',
      contentHash: 'hash',
      vector: [0.1, 0.2],
      createdAt: now,
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: 'trc-default',
      layerById: new Map([
        ['trc-default', {
          id: 'trc-default',
          textId: 't1',
          key: 'trc_default',
          name: { zho: '默认转写层' },
          layerType: 'transcription',
          languageId: 'und',
          modality: 'text',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        }],
      ]) as never,
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: [unit] },
      unitsOnCurrentMediaRef: { current: [unit] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUnitText('utt-default', '新的默认转写', 'trc-default');
    });

    expect(await db.embeddings.where('sourceId').equals('utt-default').count()).toBe(0);
  });

  it('saveUnitText should keep unit embeddings for non-default translation layers', async () => {
    const now = new Date().toISOString();
    const unit = makeUnit('utt-translation', 0, 1);

    await putTestUnitAsLayerUnit(db, unit, 'trc-default');
    await db.embeddings.put({
      id: 'unit::utt-translation::model::v1',
      sourceType: 'unit',
      sourceId: 'utt-translation',
      model: 'model',
      modelVersion: 'v1',
      contentHash: 'hash',
      vector: [0.1, 0.2],
      createdAt: now,
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: 'trc-default',
      layerById: new Map([
        ['trc-default', {
          id: 'trc-default',
          textId: 't1',
          key: 'trc_default',
          name: { zho: '默认转写层' },
          layerType: 'transcription',
          languageId: 'und',
          modality: 'text',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        }],
        ['trl-en', {
          id: 'trl-en',
          textId: 't1',
          key: 'trl_en',
          name: { zho: '英文翻译层' },
          layerType: 'translation',
          languageId: 'en',
          modality: 'text',
          createdAt: now,
          updatedAt: now,
        }],
      ]) as never,
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: [unit] },
      unitsOnCurrentMediaRef: { current: [unit] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUnitText('utt-translation', 'translation text', 'trl-en');
    });

    expect(await db.embeddings.where('sourceId').equals('utt-translation').count()).toBe(1);
  });

  it('deleteVoiceTranslation should remove saved audio translation and media item', async () => {
    const unit = makeUnit('utt-audio-delete', 0, 1);
    const translationLayer = makeLayer({
      id: 'trl-audio-delete',
      layerType: 'translation',
      modality: 'audio',
      acceptsAudio: true,
    });

    await putTestUnitAsLayerUnit(db, unit, 'trc-seed');

    let translationsState: LayerUnitContentDocType[] = [];
    let mediaItemsState: MediaItemDocType[] = [];
    const setTranslations = vi.fn((updater: LayerUnitContentDocType[] | ((prev: LayerUnitContentDocType[]) => LayerUnitContentDocType[])) => {
      translationsState = typeof updater === 'function' ? updater(translationsState) : updater;
    });
    const setMediaItems = vi.fn((updater: MediaItemDocType[] | ((prev: MediaItemDocType[]) => MediaItemDocType[])) => {
      mediaItemsState = typeof updater === 'function' ? updater(mediaItemsState) : updater;
    });
    const setSaveState = vi.fn();

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map([[translationLayer.id, translationLayer]]),
      selectedUnitMedia: undefined,
      translations: [],
      unitsRef: { current: [unit] },
      unitsOnCurrentMediaRef: { current: [unit] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems,
      setTranslations,
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveVoiceTranslation(new Blob(['audio'], { type: 'audio/webm' }), unit, translationLayer);
    });

    expect(translationsState).toHaveLength(1);
    expect(mediaItemsState).toHaveLength(1);
    expect(mediaItemsState[0]).toEqual(expect.objectContaining({
      details: expect.objectContaining({ timelineKind: 'acoustic' }),
    }));
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringMatching(/^录音翻译已保存 \(.+\)$/),
    }));

    await act(async () => {
      await result.current.deleteVoiceTranslation(unit, translationLayer);
    });

    expect(translationsState).toHaveLength(0);
    expect(mediaItemsState).toHaveLength(0);
    expect(await db.media_items.count()).toBe(0);
    expect(await db.layer_unit_contents.where('layerId').equals(translationLayer.id).count()).toBe(0);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done', message: '录音翻译已删除' }));
  });

  it('saveVoiceTranslation should not create projected child segment for standalone segment targets', async () => {
    const translationLayer = makeLayer({
      id: 'trl-segment-audio',
      layerType: 'translation',
      modality: 'audio',
      acceptsAudio: true,
      constraint: 'independent_boundary',
    });
    const now = new Date().toISOString();
    const segment: LayerUnitDocType = {
      id: 'seg-standalone-audio',
      textId: 't1',
      mediaId: 'm1',
      layerId: translationLayer.id,
      unitType: 'segment',
      startTime: 0,
      endTime: 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.layer_units.put(segment);

    let translationsState: LayerUnitContentDocType[] = [];
    let mediaItemsState: MediaItemDocType[] = [];
    const setTranslations = vi.fn((updater: LayerUnitContentDocType[] | ((prev: LayerUnitContentDocType[]) => LayerUnitContentDocType[])) => {
      translationsState = typeof updater === 'function' ? updater(translationsState) : updater;
    });
    const setMediaItems = vi.fn((updater: MediaItemDocType[] | ((prev: MediaItemDocType[]) => MediaItemDocType[])) => {
      mediaItemsState = typeof updater === 'function' ? updater(mediaItemsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map([[translationLayer.id, translationLayer]]),
      selectedUnitMedia: undefined,
      translations: [],
      unitsRef: { current: [segment] },
      unitsOnCurrentMediaRef: { current: [segment] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems,
      setTranslations,
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveVoiceTranslation(new Blob(['audio'], { type: 'audio/webm' }), segment, translationLayer);
    });

    const projectedChildren = await LayerSegmentQueryService.listSegmentsByParentUnitIds([segment.id]);
    expect(projectedChildren).toHaveLength(0);

    const segmentRows = await db.layer_unit_contents.where('unitId').equals(segment.id).toArray();
    expect(segmentRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layerId: translationLayer.id,
        unitId: segment.id,
        modality: 'audio',
      }),
    ]));
    expect(translationsState).toHaveLength(1);
    expect(mediaItemsState).toHaveLength(1);

    await act(async () => {
      await result.current.deleteVoiceTranslation(segment, translationLayer);
    });

    expect(await db.layer_unit_contents.where('unitId').equals(segment.id).count()).toBe(0);
    expect(await db.media_items.count()).toBe(0);
    expect(translationsState).toHaveLength(0);
    expect(mediaItemsState).toHaveLength(0);
  });

  it('saveVoiceTranslation upgrades existing standalone-segment text row in place', async () => {
    const translationLayer = makeLayer({
      id: 'trl-segment-mixed',
      layerType: 'translation',
      modality: 'mixed',
      acceptsAudio: true,
      constraint: 'independent_boundary',
    });
    const now = new Date().toISOString();
    const segment: LayerUnitDocType = {
      id: 'seg-standalone-upgrade',
      textId: 't1',
      mediaId: 'm1',
      layerId: translationLayer.id,
      unitType: 'segment',
      startTime: 0,
      endTime: 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.layer_units.put(segment);
    await db.layer_unit_contents.put({
      id: 'segc_existing_text',
      textId: 't1',
      unitId: segment.id,
      layerId: translationLayer.id,
      contentRole: 'primary_text',
      modality: 'text',
      text: '已有文本',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    } as LayerUnitContentDocType);

    let translationsState: LayerUnitContentDocType[] = [];
    const setTranslations = vi.fn((updater: LayerUnitContentDocType[] | ((prev: LayerUnitContentDocType[]) => LayerUnitContentDocType[])) => {
      translationsState = typeof updater === 'function' ? updater(translationsState) : updater;
    });
    const setMediaItems = vi.fn();

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map([[translationLayer.id, translationLayer]]),
      selectedUnitMedia: undefined,
      translations: [],
      unitsRef: { current: [segment] },
      unitsOnCurrentMediaRef: { current: [segment] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems,
      setTranslations,
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveVoiceTranslation(new Blob(['audio'], { type: 'audio/webm' }), segment, translationLayer);
    });

    const segmentRows = await db.layer_unit_contents.where('unitId').equals(segment.id).toArray();
    expect(segmentRows).toHaveLength(1);
    expect(segmentRows[0]).toEqual(expect.objectContaining({
      id: 'segc_existing_text',
      layerId: translationLayer.id,
      unitId: segment.id,
      modality: 'mixed',
      text: '已有文本',
    }));
    expect(segmentRows[0]?.translationAudioMediaId).toBeTruthy();
    expect(translationsState).toHaveLength(1);
    expect(translationsState[0]).toEqual(expect.objectContaining({
      id: 'segc_existing_text',
      modality: 'mixed',
      text: '已有文本',
    }));
  });

  it('saveUnitText should write translation text through canonical LayerUnit path', async () => {
    const now = new Date().toISOString();
    const unit = makeUnit('utt-stop-write', 0, 1);

    await putTestUnitAsLayerUnit(db, unit, 'trc-default');

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: 'trc-default',
      layerById: new Map([
        ['trc-default', {
          id: 'trc-default',
          textId: 't1',
          key: 'trc_default',
          name: { zho: '默认转写层' },
          layerType: 'transcription',
          languageId: 'und',
          modality: 'text',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        }],
        ['trl-en', {
          id: 'trl-en',
          textId: 't1',
          key: 'trl_en',
          name: { zho: '英文翻译层' },
          layerType: 'translation',
          languageId: 'en',
          modality: 'text',
          createdAt: now,
          updatedAt: now,
        }],
      ]) as never,
      selectedUnitMedia: undefined,

      translations: [],
      unitsRef: { current: [unit] },
      unitsOnCurrentMediaRef: { current: [unit] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUnitText('utt-stop-write', 'translation via layerunit only', 'trl-en');
    });

    expect(await db.layer_units.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'utt-stop-write',
        layerId: 'trc-default',
        unitType: 'unit',
      }),
      expect.objectContaining({
        id: 'segv2_trl-en_utt-stop-write',
        layerId: 'trl-en',
        unitType: 'segment',
      }),
    ]));
    expect(await db.layer_unit_contents.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        unitId: 'segv2_trl-en_utt-stop-write',
        layerId: 'trl-en',
        text: 'translation via layerunit only',
      }),
    ]));
  });

  it('offsetSelectedTimes should rollback when persistence fails after pushUndo', async () => {
    const pushUndo = vi.fn();
    const rollbackUndo = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    vi.spyOn(LinguisticService, 'saveUnitsBatch').mockRejectedValue(new Error('db write failed'));

    let unitsState = [
      makeUnit('u1', 0, 1),
      makeUnit('u2', 1.2, 2),
    ];

    const setUnits = vi.fn((updater: ((prev: LayerUnitDocType[]) => LayerUnitDocType[]) | LayerUnitDocType[]) => {
      unitsState = typeof updater === 'function' ? updater(unitsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      rollbackUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.offsetSelectedTimes(new Set(['u1']), 0.1);
    });

    expect(pushUndo).toHaveBeenCalledTimes(1);
    expect(rollbackUndo).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: expect.stringContaining('已回滚'),
    }));
    // Local state should not be changed when persistence fails.
    expect(unitsState[0]?.startTime).toBe(0);
    expect(unitsState[0]?.endTime).toBe(1);
  });

  it('offsetSelectedTimes should log both operation error and rollback warning when rollback also fails', async () => {
    const pushUndo = vi.fn();
    const rollbackUndo = vi.fn(async () => {
      throw new Error('rollback failed');
    });
    const setSaveState = vi.fn();
    vi.spyOn(LinguisticService, 'saveUnitsBatch').mockRejectedValue(new Error('db write failed'));

    let unitsState = [
      makeUnit('u1', 0, 1),
      makeUnit('u2', 1.2, 2),
    ];

    const setUnits = vi.fn((updater: ((prev: LayerUnitDocType[]) => LayerUnitDocType[]) | LayerUnitDocType[]) => {
      unitsState = typeof updater === 'function' ? updater(unitsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      rollbackUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.offsetSelectedTimes(new Set(['u1']), 0.1);
    });

    expect(mockLogWarn).toHaveBeenCalledWith(
      'Rollback after offsetSelectedTimes failure also failed',
      expect.objectContaining({ error: 'rollback failed' }),
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'offsetSelectedTimes failed',
      expect.objectContaining({ error: 'db write failed' }),
    );
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: expect.stringContaining('已回滚'),
    }));
  });

  it('scaleSelectedTimes should log both operation error and rollback warning when rollback also fails', async () => {
    const pushUndo = vi.fn();
    const rollbackUndo = vi.fn(async () => {
      throw new Error('rollback failed');
    });
    const setSaveState = vi.fn();
    vi.spyOn(LinguisticService, 'saveUnitsBatch').mockRejectedValue(new Error('db write failed'));

    let unitsState = [
      makeUnit('u1', 1, 2),
      makeUnit('u2', 2.2, 3.2),
    ];

    const setUnits = vi.fn((updater: ((prev: LayerUnitDocType[]) => LayerUnitDocType[]) | LayerUnitDocType[]) => {
      unitsState = typeof updater === 'function' ? updater(unitsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      rollbackUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.scaleSelectedTimes(new Set(['u1', 'u2']), 2, 1);
    });

    expect(mockLogWarn).toHaveBeenCalledWith(
      'Rollback after scaleSelectedTimes failure also failed',
      expect.objectContaining({ error: 'rollback failed' }),
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'scaleSelectedTimes failed',
      expect.objectContaining({ error: 'db write failed' }),
    );
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: expect.stringContaining('已回滚'),
    }));
  });

  it('splitByRegex should log both operation error and rollback warning when rollback also fails', async () => {
    const pushUndo = vi.fn();
    const rollbackUndo = vi.fn(async () => {
      throw new Error('rollback failed');
    });
    const setSaveState = vi.fn();
    vi.spyOn(LinguisticService, 'saveUnitsBatch').mockRejectedValue(new Error('db write failed'));

    let unitsState = [makeUnit('u1', 0, 3)];
    const setUnits = vi.fn((updater: ((prev: LayerUnitDocType[]) => LayerUnitDocType[]) | LayerUnitDocType[]) => {
      unitsState = typeof updater === 'function' ? updater(unitsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: () => 'a,b,c',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      rollbackUndo,
      createAnchor: vi.fn(async (_db, mediaId, time) => ({
        id: 'a1',
        mediaId,
        time,
        createdAt: new Date().toISOString(),
      } as AnchorDocType)),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.splitByRegex(new Set(['u1']), ',', 'g');
    });

    expect(mockLogWarn).toHaveBeenCalledWith(
      'Rollback after splitByRegex failure also failed',
      expect.objectContaining({ error: 'rollback failed' }),
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'splitByRegex failed',
      expect.objectContaining({ error: 'db write failed' }),
    );
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: expect.stringContaining('已回滚'),
    }));
  });

  it('mergeSelectedUnits should log both operation error and rollback warning when rollback also fails', async () => {
    const pushUndo = vi.fn();
    const rollbackUndo = vi.fn(async () => {
      throw new Error('rollback failed');
    });
    const setSaveState = vi.fn();
    vi.spyOn(LinguisticService, 'saveUnit').mockRejectedValue(new Error('db write failed'));

    let unitsState = [
      makeUnit('u1', 0, 1),
      makeUnit('u2', 1.2, 2),
    ];
    const setUnits = vi.fn((updater: ((prev: LayerUnitDocType[]) => LayerUnitDocType[]) | LayerUnitDocType[]) => {
      unitsState = typeof updater === 'function' ? updater(unitsState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      unitsRef: { current: unitsState },
      unitsOnCurrentMediaRef: { current: unitsState },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      rollbackUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.mergeSelectedUnits(new Set(['u1', 'u2']));
    });

    expect(mockLogWarn).toHaveBeenCalledWith(
      'Rollback after mergeSelectedUnits failure also failed',
      expect.objectContaining({ error: 'rollback failed' }),
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'mergeSelectedUnits failed',
      expect.objectContaining({ error: 'db write failed' }),
    );
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: expect.stringContaining('已回滚'),
    }));
  });

  it('createUnitFromSelection should select created unit with non-empty layerId', async () => {
    const now = new Date().toISOString();
    const selectedTimelineUnits: Array<{ layerId: string; unitId: string; kind: 'unit' | 'segment' } | null> = [];
    const setSelectedTimelineUnit = vi.fn((next: { layerId: string; unitId: string; kind: 'unit' | 'segment' } | null) => {
      selectedTimelineUnits.push(next);
    });

    const setSelectedUnitIds = vi.fn();
    const setUnits = vi.fn();

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: 'trc-default',
      layerById: new Map(),
      selectedUnitMedia: {
        id: 'media-1',
        textId: 'text-1',
        filename: 'demo.wav',
        duration: 120,
        sourceType: 'upload',
        createdAt: now,
        updatedAt: now,
      } as never,
      translations: [],
      unitsRef: { current: [] },
      unitsOnCurrentMediaRef: { current: [] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(async (_db, mediaId, time) => ({
        id: `a_${time}`,
        mediaId,
        time,
        createdAt: now,
      } as AnchorDocType)),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits,
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds,
      setSelectedTimelineUnit: setSelectedTimelineUnit as any,
    }));

    await act(async () => {
      await result.current.createUnitFromSelection(1.0, 2.0);
    });

    const nonNullSelections = selectedTimelineUnits.filter((item): item is { layerId: string; unitId: string; kind: 'unit' | 'segment' } => item !== null);
    expect(nonNullSelections.length).toBeGreaterThan(0);
    const latest = nonNullSelections[nonNullSelections.length - 1];
    expect(latest?.kind).toBe('unit');
    expect(latest?.layerId).toBe('trc-default');
    expect(latest?.unitId).toBeTruthy();
  });

  it('createUnitFromSelection keeps current selection when selectionBehavior is keep-current', async () => {
    const now = new Date().toISOString();
    const setSelectedTimelineUnit = vi.fn();

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: 'trc-default',
      layerById: new Map(),
      selectedUnitMedia: {
        id: 'media-1',
        textId: 'text-1',
        filename: 'demo.wav',
        duration: 120,
        sourceType: 'upload',
        createdAt: now,
        updatedAt: now,
      } as never,
      translations: [],
      unitsRef: { current: [] },
      unitsOnCurrentMediaRef: { current: [] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(async (_db, mediaId, time) => ({
        id: `a_${time}`,
        mediaId,
        time,
        createdAt: now,
      } as AnchorDocType)),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
      setSelectedTimelineUnit: setSelectedTimelineUnit as any,
    }));

    await act(async () => {
      await result.current.createUnitFromSelection(1.0, 2.0, { selectionBehavior: 'keep-current' });
    });

    expect(setSelectedTimelineUnit).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'unit' }));
  });

  it('saves self-certainty onto a segment unit when the project has no unit rows', async () => {
    const now = new Date().toISOString();
    await db.layer_units.put({
      id: 'seg-only-1',
      textId: 't1',
      mediaId: 'm1',
      layerId: 'layer-seg',
      unitType: 'segment',
      startTime: 5,
      endTime: 7,
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType);

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      translations: [],
      unitsRef: { current: [] },
      unitsOnCurrentMediaRef: { current: [] },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUnitSelfCertainty(['seg-only-1'], 'uncertain');
    });

    const updated = await db.layer_units.get('seg-only-1');
    expect(updated?.selfCertainty).toBe('uncertain');
  });

  it('saveUnitLayerFields writes status onto a segment row without touching canonical unit rows', async () => {
    const now = new Date().toISOString();
    await db.layer_units.bulkPut([
      {
        id: 'utt-host',
        textId: 't1',
        mediaId: 'm1',
        layerId: 'layer-default',
        unitType: 'unit',
        startTime: 0,
        endTime: 10,
        status: 'raw',
        createdAt: now,
        updatedAt: now,
      } as LayerUnitDocType,
      {
        id: 'seg-a',
        textId: 't1',
        mediaId: 'm1',
        layerId: 'layer-seg',
        unitType: 'segment',
        parentUnitId: 'utt-host',
        startTime: 1,
        endTime: 2,
        createdAt: now,
        updatedAt: now,
      } as LayerUnitDocType,
    ]);

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      translations: [],
      unitsRef: { current: [] },
      unitsOnCurrentMediaRef: { current: [] },
      getUnitTextForLayer: (unit) => unit.id,
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUnitLayerFields(['seg-a'], { status: 'verified' });
    });

    const seg = await db.layer_units.get('seg-a');
    const host = await db.layer_units.get('utt-host');
    expect(seg?.status).toBe('verified');
    expect(host?.status).toBe('raw');
  });

  it('projects a new unit to both dependent transcription layer and its parent root', async () => {
    const now = new Date().toISOString();
    const rootLayer = makeLayer({
      id: 'trc-root',
      layerType: 'transcription',
      constraint: 'independent_boundary',
      isDefault: true,
      sortOrder: 0,
    });
    const dependentLayer = makeLayer({
      id: 'trc-dependent',
      layerType: 'transcription',
      constraint: 'symbolic_association',
      parentLayerId: rootLayer.id,
      sortOrder: 1,
    });
    await LayerTierUnifiedService.createLayer(rootLayer);
    await LayerTierUnifiedService.createLayer(dependentLayer);

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: rootLayer.id,
      layerById: new Map([
        [rootLayer.id, rootLayer],
        [dependentLayer.id, dependentLayer],
      ]),
      selectedUnitMedia: {
        id: 'media-1',
        textId: 't1',
        filename: 'demo.wav',
        duration: 120,
        sourceType: 'upload',
        createdAt: now,
        updatedAt: now,
      } as never,
      translations: [],
      unitsRef: { current: [] },
      unitsOnCurrentMediaRef: { current: [] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(async (_db, mediaId, time) => ({
        id: `a_${time}`,
        mediaId,
        time,
        createdAt: now,
      } as AnchorDocType)),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.createUnitFromSelection(1, 2, { focusedLayerId: dependentLayer.id });
    });

    const createdUnitUnits = await db.layer_units.where('unitType').equals('unit').toArray();
    expect(createdUnitUnits).toHaveLength(1);
    const createdUnit = createdUnitUnits[0]!;

    const rootSegments = await LayerSegmentQueryService.listSegmentsByLayerId(rootLayer.id);
    const dependentSegments = await LayerSegmentQueryService.listSegmentsByLayerId(dependentLayer.id);

    expect(rootSegments).toHaveLength(1);
    expect(dependentSegments).toHaveLength(1);
    expect(rootSegments[0]?.unitId).toBe(createdUnit.id);
    expect(dependentSegments[0]?.unitId).toBe(createdUnit.id);
  });

  it('transcribeVoiceTranslation merges text into existing audio row as mixed (no second text row)', async () => {
    const unit = makeUnit('utt-stt-merge', 0, 1);
    const translationLayer = makeLayer({
      id: 'trl-stt-merge',
      layerType: 'translation',
      modality: 'mixed',
      acceptsAudio: true,
    });

    await putTestUnitAsLayerUnit(db, unit, 'trc-seed');

    let translationsState: LayerUnitContentDocType[] = [];
    let mediaItemsState: MediaItemDocType[] = [];
    const setTranslations = vi.fn((updater: LayerUnitContentDocType[] | ((prev: LayerUnitContentDocType[]) => LayerUnitContentDocType[])) => {
      translationsState = typeof updater === 'function' ? updater(translationsState) : updater;
    });
    const setMediaItems = vi.fn((updater: MediaItemDocType[] | ((prev: MediaItemDocType[]) => MediaItemDocType[])) => {
      mediaItemsState = typeof updater === 'function' ? updater(mediaItemsState) : updater;
    });
    const setSaveState = vi.fn();
    const setTranslationDrafts = vi.fn();

    const whisperSpy = vi.spyOn(LocalWhisperSttProvider.prototype, 'transcribe').mockResolvedValue({
      text: ' merged text ',
      lang: 'en-US',
      isFinal: true,
      confidence: 0.9,
      engine: 'whisper-local',
    });

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map([[translationLayer.id, translationLayer]]),
      selectedUnitMedia: undefined,
      translations: [],
      unitsRef: { current: [unit] },
      unitsOnCurrentMediaRef: { current: [unit] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems,
      setTranslations,
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts,
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveVoiceTranslation(new Blob(['a'], { type: 'audio/webm' }), unit, translationLayer);
    });

    expect(translationsState).toHaveLength(1);
    const rowId = translationsState[0]!.id;
    expect(translationsState[0]).toEqual(expect.objectContaining({ modality: 'audio' }));

    const sttBlob = mediaItemsState.find((m) => m.id === translationsState[0]!.translationAudioMediaId);
    const blobFromState = sttBlob?.details && typeof sttBlob.details === 'object'
      && (sttBlob.details as { audioBlob?: unknown }).audioBlob instanceof Blob
      ? (sttBlob.details as { audioBlob: Blob }).audioBlob
      : new Blob(['a'], { type: 'audio/webm' });

    await act(async () => {
      await result.current.transcribeVoiceTranslation(unit, translationLayer, { audioBlob: blobFromState });
    });

    expect(whisperSpy).toHaveBeenCalled();
    expect(translationsState).toHaveLength(1);
    expect(translationsState[0]).toEqual(expect.objectContaining({
      id: rowId,
      modality: 'mixed',
      text: 'merged text',
    }));

    const rows = await db.layer_unit_contents.where('layerId').equals(translationLayer.id).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      id: rowId,
      modality: 'mixed',
      text: 'merged text',
    }));

    expect(setTranslationDrafts).toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '译文录音已转写并回填',
    }));

    whisperSpy.mockRestore();
  });

  it('transcribeVoiceTranslation uses runtime-injected commercial credentials after whisper fallback', async () => {
    const unit = makeUnit('utt-stt-runtime-commercial', 0, 1);
    const translationLayer = makeLayer({
      id: 'trl-stt-runtime-commercial',
      layerType: 'translation',
      modality: 'mixed',
      acceptsAudio: true,
    });

    window.localStorage.setItem('jieyu.voiceAgent.commercialStt', JSON.stringify({
      kind: 'groq',
      config: {
        baseUrl: 'https://api.example.com',
        model: 'whisper-large-v3',
      },
    }));

    setCommercialSttRuntimeSnapshot('groq', {
      apiKey: 'sk-runtime-secret',
      baseUrl: 'https://api.example.com',
      model: 'whisper-large-v3',
    });

    await putTestUnitAsLayerUnit(db, unit, 'trc-seed');

    let translationsState: LayerUnitContentDocType[] = [];
    let mediaItemsState: MediaItemDocType[] = [];
    const setTranslations = vi.fn((updater: LayerUnitContentDocType[] | ((prev: LayerUnitContentDocType[]) => LayerUnitContentDocType[])) => {
      translationsState = typeof updater === 'function' ? updater(translationsState) : updater;
    });
    const setMediaItems = vi.fn((updater: MediaItemDocType[] | ((prev: MediaItemDocType[]) => MediaItemDocType[])) => {
      mediaItemsState = typeof updater === 'function' ? updater(mediaItemsState) : updater;
    });
    const setSaveState = vi.fn();
    const setTranslationDrafts = vi.fn();

    vi.spyOn(LocalWhisperSttProvider.prototype, 'transcribe').mockRejectedValue(new Error('whisper down'));
    const commercialTranscribe = vi.fn().mockResolvedValue({
      text: 'runtime commercial text',
      lang: 'en-US',
      isFinal: true,
      confidence: 0.8,
      engine: 'commercial',
    });
    const createCommercialProviderSpy = vi.spyOn(sttModule, 'createCommercialProvider').mockReturnValue({
      isAvailable: vi.fn().mockResolvedValue(true),
      transcribe: commercialTranscribe,
    } as unknown as ReturnType<typeof sttModule.createCommercialProvider>);

    const { result } = renderHook(() => useTranscriptionUnitActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map([[translationLayer.id, translationLayer]]),
      selectedUnitMedia: undefined,
      translations: [],
      unitsRef: { current: [unit] },
      unitsOnCurrentMediaRef: { current: [unit] },
      getUnitTextForLayer: () => '',
      timingGestureRef: { current: { active: false, unitId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems,
      setTranslations,
      setUnits: vi.fn(),
      setUnitDrafts: vi.fn(),
      setTranslationDrafts,
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveVoiceTranslation(new Blob(['a'], { type: 'audio/webm' }), unit, translationLayer);
    });

    const sttBlob = mediaItemsState.find((m) => m.id === translationsState[0]!.translationAudioMediaId);
    const blobFromState = sttBlob?.details && typeof sttBlob.details === 'object'
      && (sttBlob.details as { audioBlob?: unknown }).audioBlob instanceof Blob
      ? (sttBlob.details as { audioBlob: Blob }).audioBlob
      : new Blob(['a'], { type: 'audio/webm' });

    await act(async () => {
      await result.current.transcribeVoiceTranslation(unit, translationLayer, { audioBlob: blobFromState });
    });

    expect(createCommercialProviderSpy).toHaveBeenCalledWith('groq', expect.objectContaining({
      apiKey: 'sk-runtime-secret',
      baseUrl: 'https://api.example.com',
      model: 'whisper-large-v3',
    }));
    expect(commercialTranscribe).toHaveBeenCalledTimes(1);
    expect(translationsState[0]).toEqual(expect.objectContaining({
      modality: 'mixed',
      text: 'runtime commercial text',
    }));
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '译文录音已转写并回填',
    }));
  });
});
