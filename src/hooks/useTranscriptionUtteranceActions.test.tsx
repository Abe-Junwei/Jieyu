// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { AnchorDocType, UtteranceDocType } from '../db';
import { db } from '../db';
import { LinguisticService } from '../services/LinguisticService';

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

describe('useTranscriptionUtteranceActions - batch operations', () => {
  beforeEach(async () => {
    await db.open();
    await db.utterance_texts.clear();
    mockLogWarn.mockReset();
    mockLogError.mockReset();
  });

  afterEach(() => {
    cleanup();
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
    await db.utterance_texts.add({
      id: 'utr-legacy',
      utteranceId: 'utt-1',
      tierId: 'tr-layer-1',
      modality: 'text',
      text: 'old',
      sourceType: 'human',
      recordedBySpeakerId: 'spk-legacy',
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
    }));

    await act(async () => {
      await result.current.saveTextTranslationForUtterance('utt-1', 'updated', 'tr-layer-1');
    });

    const json = await db.utterance_texts.get('utr-legacy') as Record<string, unknown> | undefined;

    expect(json?.text).toBe('updated');
    expect(json && 'recordedBySpeakerId' in json).toBe(false);
    expect(pushUndo).toHaveBeenCalledWith('编辑翻译文本');
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
      selectedUtteranceMedia: undefined,
      selectedUtteranceId: '',
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
      setSelectedUtteranceId: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
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
});
