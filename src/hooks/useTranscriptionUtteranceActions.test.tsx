// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { AnchorDocType, LayerDocType, MediaItemDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { db } from '../db';
import { putTestUtteranceAsLayerUnit } from '../db/putTestUtteranceAsLayerUnit';
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

import { useTranscriptionUtteranceActions } from './useTranscriptionUtteranceActions';

function makeUtterance(id: string, startTime: number, endTime: number): UtteranceDocType {
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
  } as UtteranceDocType;
}

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation' }): LayerDocType {
  const now = new Date().toISOString();
  const { id, layerType, ...rest } = overrides;
  return {
    ...rest,
    id,
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
  } as LayerDocType;
}

describe('useTranscriptionUtteranceActions - batch operations', () => {
  beforeEach(async () => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
    await db.open();
    await Promise.all([
      db.embeddings.clear(),
      db.tier_definitions.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
    mockLogWarn.mockReset();
    mockLogError.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('offsetSelectedTimes should block overlap and not push undo', async () => {
    const pushUndo = vi.fn();
    const setSaveState = vi.fn();
    let utterancesState = [
      makeUtterance('u1', 0, 1),
      makeUtterance('u2', 1.1, 2),
    ];

    const setUtterances = vi.fn((updater: ((prev: UtteranceDocType[]) => UtteranceDocType[]) | UtteranceDocType[]) => {
      utterancesState = typeof updater === 'function' ? updater(utterancesState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: (utterance) => utterance.id,
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances,
      setUtteranceDrafts: vi.fn(),
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
    expect(utterancesState[0]?.startTime).toBe(0);
    expect(utterancesState[0]?.endTime).toBe(1);
  });

  it('scaleSelectedTimes should push undo once and update selected ranges', async () => {
    const pushUndo = vi.fn();
    const setSaveState = vi.fn();
    const saveBatchSpy = vi.spyOn(LinguisticService, 'saveUtterancesBatch').mockResolvedValue();

    let utterancesState = [
      makeUtterance('u1', 1, 2),
      makeUtterance('u2', 2.2, 3.2),
      makeUtterance('u3', 6, 7),
    ];

    const setUtterances = vi.fn((updater: ((prev: UtteranceDocType[]) => UtteranceDocType[]) | UtteranceDocType[]) => {
      utterancesState = typeof updater === 'function' ? updater(utterancesState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: (utterance) => utterance.id,
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances,
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.scaleSelectedTimes(new Set(['u1', 'u2']), 2, 1);
    });

    expect(pushUndo).toHaveBeenCalledTimes(1);
    expect(pushUndo).toHaveBeenCalledWith('批量时间缩放');
    expect(saveBatchSpy).toHaveBeenCalledTimes(1);
    expect(utterancesState.find((u) => u.id === 'u1')?.startTime).toBe(1);
    expect(utterancesState.find((u) => u.id === 'u1')?.endTime).toBe(3);
    expect(utterancesState.find((u) => u.id === 'u2')?.startTime).toBe(3.4);
    expect(utterancesState.find((u) => u.id === 'u2')?.endTime).toBe(5.4);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('splitByRegex should return validation error for invalid pattern without pushUndo', async () => {
    const pushUndo = vi.fn();
    const setSaveState = vi.fn();
    const utterancesState = [makeUtterance('u1', 0, 3)];

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: () => 'a,b,c',
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
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

  it('saveTextTranslationForUtterance should strip legacy speaker linkage fields', async () => {
    const now = new Date().toISOString();
    // Seed utterance (needed for V2 sync) | 种子 utterance（V2 sync 需要）
    const utterance = makeUtterance('utt-1', 0, 1);
    await putTestUtteranceAsLayerUnit(db, utterance, 'trc-host');

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

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
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
      utterancesRef: { current: [] },
      utterancesOnCurrentMediaRef: { current: [] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations,
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveTextTranslationForUtterance('utt-1', 'updated', 'tr-layer-1');
    });

    // Phase 1+2: 检查 V2 layer_segment_contents 而非 utterance_texts | Check V2 instead of V1
    const v2Content = await db.layer_unit_contents.get('utr-legacy') as Record<string, unknown> | undefined;

    expect(v2Content?.text).toBe('updated');
    expect(v2Content && 'recordedBySpeakerId' in v2Content).toBe(false);
    expect(pushUndo).toHaveBeenCalledWith('编辑翻译文本');
  });

  it('saveUtteranceText should invalidate utterance embeddings for the default transcription layer', async () => {
    const now = new Date().toISOString();
    const utterance = makeUtterance('utt-default', 0, 1);

    await putTestUtteranceAsLayerUnit(db, utterance, 'trc-default');
    await db.embeddings.put({
      id: 'utterance::utt-default::model::v1',
      sourceType: 'utterance',
      sourceId: 'utt-default',
      model: 'model',
      modelVersion: 'v1',
      contentHash: 'hash',
      vector: [0.1, 0.2],
      createdAt: now,
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
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
      utterancesRef: { current: [utterance] },
      utterancesOnCurrentMediaRef: { current: [utterance] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUtteranceText('utt-default', '新的默认转写', 'trc-default');
    });

    expect(await db.embeddings.where('sourceId').equals('utt-default').count()).toBe(0);
  });

  it('saveUtteranceText should keep utterance embeddings for non-default translation layers', async () => {
    const now = new Date().toISOString();
    const utterance = makeUtterance('utt-translation', 0, 1);

    await putTestUtteranceAsLayerUnit(db, utterance, 'trc-default');
    await db.embeddings.put({
      id: 'utterance::utt-translation::model::v1',
      sourceType: 'utterance',
      sourceId: 'utt-translation',
      model: 'model',
      modelVersion: 'v1',
      contentHash: 'hash',
      vector: [0.1, 0.2],
      createdAt: now,
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
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
      utterancesRef: { current: [utterance] },
      utterancesOnCurrentMediaRef: { current: [utterance] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUtteranceText('utt-translation', 'translation text', 'trl-en');
    });

    expect(await db.embeddings.where('sourceId').equals('utt-translation').count()).toBe(1);
  });

  it('deleteVoiceTranslation should remove saved audio translation and media item', async () => {
    const utterance = makeUtterance('utt-audio-delete', 0, 1);
    const translationLayer = makeLayer({
      id: 'trl-audio-delete',
      layerType: 'translation',
      modality: 'audio',
      acceptsAudio: true,
    });

    await putTestUtteranceAsLayerUnit(db, utterance, 'trc-seed');

    let translationsState: UtteranceTextDocType[] = [];
    let mediaItemsState: MediaItemDocType[] = [];
    const setTranslations = vi.fn((updater: UtteranceTextDocType[] | ((prev: UtteranceTextDocType[]) => UtteranceTextDocType[])) => {
      translationsState = typeof updater === 'function' ? updater(translationsState) : updater;
    });
    const setMediaItems = vi.fn((updater: MediaItemDocType[] | ((prev: MediaItemDocType[]) => MediaItemDocType[])) => {
      mediaItemsState = typeof updater === 'function' ? updater(mediaItemsState) : updater;
    });
    const setSaveState = vi.fn();

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map([[translationLayer.id, translationLayer]]),
      selectedUnitMedia: undefined,
      translations: [],
      utterancesRef: { current: [utterance] },
      utterancesOnCurrentMediaRef: { current: [utterance] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState,
      setSnapGuide: vi.fn(),
      setMediaItems,
      setTranslations,
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveVoiceTranslation(new Blob(['audio'], { type: 'audio/webm' }), utterance, translationLayer);
    });

    expect(translationsState).toHaveLength(1);
    expect(mediaItemsState).toHaveLength(1);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringMatching(/^录音翻译已保存 \(.+\)$/),
    }));

    await act(async () => {
      await result.current.deleteVoiceTranslation(utterance, translationLayer);
    });

    expect(translationsState).toHaveLength(0);
    expect(mediaItemsState).toHaveLength(0);
    expect(await db.media_items.count()).toBe(0);
    expect(await db.layer_unit_contents.where('layerId').equals(translationLayer.id).count()).toBe(0);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done', message: '录音翻译已删除' }));
  });

  it('saveUtteranceText should write translation text through canonical LayerUnit path', async () => {
    const now = new Date().toISOString();
    const utterance = makeUtterance('utt-stop-write', 0, 1);

    await putTestUtteranceAsLayerUnit(db, utterance, 'trc-default');

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
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
      utterancesRef: { current: [utterance] },
      utterancesOnCurrentMediaRef: { current: [utterance] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
      timingUndoRef: { current: null },
      pushUndo: vi.fn(),
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      setSaveState: vi.fn(),
      setSnapGuide: vi.fn(),
      setMediaItems: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveUtteranceText('utt-stop-write', 'translation via layerunit only', 'trl-en');
    });

    expect(await db.layer_units.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'utt-stop-write',
        layerId: 'trc-default',
        unitType: 'utterance',
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
    vi.spyOn(LinguisticService, 'saveUtterancesBatch').mockRejectedValue(new Error('db write failed'));

    let utterancesState = [
      makeUtterance('u1', 0, 1),
      makeUtterance('u2', 1.2, 2),
    ];

    const setUtterances = vi.fn((updater: ((prev: UtteranceDocType[]) => UtteranceDocType[]) | UtteranceDocType[]) => {
      utterancesState = typeof updater === 'function' ? updater(utterancesState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: (utterance) => utterance.id,
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances,
      setUtteranceDrafts: vi.fn(),
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
    expect(utterancesState[0]?.startTime).toBe(0);
    expect(utterancesState[0]?.endTime).toBe(1);
  });

  it('offsetSelectedTimes should log both operation error and rollback warning when rollback also fails', async () => {
    const pushUndo = vi.fn();
    const rollbackUndo = vi.fn(async () => {
      throw new Error('rollback failed');
    });
    const setSaveState = vi.fn();
    vi.spyOn(LinguisticService, 'saveUtterancesBatch').mockRejectedValue(new Error('db write failed'));

    let utterancesState = [
      makeUtterance('u1', 0, 1),
      makeUtterance('u2', 1.2, 2),
    ];

    const setUtterances = vi.fn((updater: ((prev: UtteranceDocType[]) => UtteranceDocType[]) | UtteranceDocType[]) => {
      utterancesState = typeof updater === 'function' ? updater(utterancesState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: (utterance) => utterance.id,
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances,
      setUtteranceDrafts: vi.fn(),
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
    vi.spyOn(LinguisticService, 'saveUtterancesBatch').mockRejectedValue(new Error('db write failed'));

    let utterancesState = [
      makeUtterance('u1', 1, 2),
      makeUtterance('u2', 2.2, 3.2),
    ];

    const setUtterances = vi.fn((updater: ((prev: UtteranceDocType[]) => UtteranceDocType[]) | UtteranceDocType[]) => {
      utterancesState = typeof updater === 'function' ? updater(utterancesState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: (utterance) => utterance.id,
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances,
      setUtteranceDrafts: vi.fn(),
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
    vi.spyOn(LinguisticService, 'saveUtterancesBatch').mockRejectedValue(new Error('db write failed'));

    let utterancesState = [makeUtterance('u1', 0, 3)];
    const setUtterances = vi.fn((updater: ((prev: UtteranceDocType[]) => UtteranceDocType[]) | UtteranceDocType[]) => {
      utterancesState = typeof updater === 'function' ? updater(utterancesState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: () => 'a,b,c',
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances,
      setUtteranceDrafts: vi.fn(),
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

  it('mergeSelectedUtterances should log both operation error and rollback warning when rollback also fails', async () => {
    const pushUndo = vi.fn();
    const rollbackUndo = vi.fn(async () => {
      throw new Error('rollback failed');
    });
    const setSaveState = vi.fn();
    vi.spyOn(LinguisticService, 'saveUtterance').mockRejectedValue(new Error('db write failed'));

    let utterancesState = [
      makeUtterance('u1', 0, 1),
      makeUtterance('u2', 1.2, 2),
    ];
    const setUtterances = vi.fn((updater: ((prev: UtteranceDocType[]) => UtteranceDocType[]) | UtteranceDocType[]) => {
      utterancesState = typeof updater === 'function' ? updater(utterancesState) : updater;
    });

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
      defaultTranscriptionLayerId: undefined,
      layerById: new Map(),
      selectedUnitMedia: undefined,
      
      translations: [],
      utterancesRef: { current: utterancesState },
      utterancesOnCurrentMediaRef: { current: utterancesState },
      getUtteranceTextForLayer: (utterance) => utterance.id,
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances,
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.mergeSelectedUtterances(new Set(['u1', 'u2']));
    });

    expect(mockLogWarn).toHaveBeenCalledWith(
      'Rollback after mergeSelectedUtterances failure also failed',
      expect.objectContaining({ error: 'rollback failed' }),
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'mergeSelectedUtterances failed',
      expect.objectContaining({ error: 'db write failed' }),
    );
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: expect.stringContaining('已回滚'),
    }));
  });

  it('createUtteranceFromSelection should select created unit with non-empty layerId', async () => {
    const now = new Date().toISOString();
    const selectedTimelineUnits: Array<{ layerId: string; unitId: string; kind: 'utterance' | 'segment' } | null> = [];
    const setSelectedTimelineUnit = vi.fn((next: { layerId: string; unitId: string; kind: 'utterance' | 'segment' } | null) => {
      selectedTimelineUnits.push(next);
    });

    const setSelectedUnitIds = vi.fn();
    const setUtterances = vi.fn();

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
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
      utterancesRef: { current: [] },
      utterancesOnCurrentMediaRef: { current: [] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances,
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds,
      setSelectedTimelineUnit: setSelectedTimelineUnit as any,
    }));

    await act(async () => {
      await result.current.createUtteranceFromSelection(1.0, 2.0);
    });

    const nonNullSelections = selectedTimelineUnits.filter((item): item is { layerId: string; unitId: string; kind: 'utterance' | 'segment' } => item !== null);
    expect(nonNullSelections.length).toBeGreaterThan(0);
    const latest = nonNullSelections[nonNullSelections.length - 1];
    expect(latest?.kind).toBe('utterance');
    expect(latest?.layerId).toBe('trc-default');
    expect(latest?.unitId).toBeTruthy();
  });

  it('createUtteranceFromSelection keeps current selection when selectionBehavior is keep-current', async () => {
    const now = new Date().toISOString();
    const setSelectedTimelineUnit = vi.fn();

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
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
      utterancesRef: { current: [] },
      utterancesOnCurrentMediaRef: { current: [] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
      setSelectedTimelineUnit: setSelectedTimelineUnit as any,
    }));

    await act(async () => {
      await result.current.createUtteranceFromSelection(1.0, 2.0, { selectionBehavior: 'keep-current' });
    });

    expect(setSelectedTimelineUnit).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'utterance' }));
  });

  it('projects a new utterance to both dependent transcription layer and its parent root', async () => {
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

    const { result } = renderHook(() => useTranscriptionUtteranceActions({
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
      utterancesRef: { current: [] },
      utterancesOnCurrentMediaRef: { current: [] },
      getUtteranceTextForLayer: () => '',
      timingGestureRef: { current: { active: false, utteranceId: null } },
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
      setUtterances: vi.fn(),
      setUtteranceDrafts: vi.fn(),
      activeUnitId: '',
      setSelectedUnitIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.createUtteranceFromSelection(1, 2, { focusedLayerId: dependentLayer.id });
    });

    const createdUtteranceUnits = await db.layer_units.where('unitType').equals('utterance').toArray();
    expect(createdUtteranceUnits).toHaveLength(1);
    const createdUtterance = createdUtteranceUnits[0]!;

    const rootSegments = await LayerSegmentQueryService.listSegmentsByLayerId(rootLayer.id);
    const dependentSegments = await LayerSegmentQueryService.listSegmentsByLayerId(dependentLayer.id);

    expect(rootSegments).toHaveLength(1);
    expect(dependentSegments).toHaveLength(1);
    expect(rootSegments[0]?.utteranceId).toBe(createdUtterance.id);
    expect(dependentSegments[0]?.utteranceId).toBe(createdUtterance.id);
  });
});
