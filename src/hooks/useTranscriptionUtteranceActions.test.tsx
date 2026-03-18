// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { UtteranceDocType } from '../../db';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
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
});
