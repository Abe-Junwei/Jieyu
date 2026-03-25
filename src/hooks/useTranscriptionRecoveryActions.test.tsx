// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RecoveryData } from '../services/SnapshotService';
import type { UtteranceDocType } from '../db';
import { useTranscriptionRecoveryActions } from './useTranscriptionRecoveryActions';

const {
  mockFindByIndexAnyOf,
  mockInsertUtteranceText,
  mockInsertTranslationLayer,
  mockSaveUtterance,
  mockClearRecoverySnapshot,
  mockSyncUtteranceTextToSegmentationV2,
} = vi.hoisted(() => ({
  mockFindByIndexAnyOf: vi.fn(),
  mockInsertUtteranceText: vi.fn(),
  mockInsertTranslationLayer: vi.fn(),
  mockSaveUtterance: vi.fn(),
  mockClearRecoverySnapshot: vi.fn(),
  mockSyncUtteranceTextToSegmentationV2: vi.fn(async () => undefined),
}));

vi.mock('../db', () => ({
  getDb: vi.fn(async () => ({
    collections: {
      utterances: {
        findByIndexAnyOf: mockFindByIndexAnyOf,
      },
      utterance_texts: {
        insert: mockInsertUtteranceText,
      },
      translation_layers: {
        insert: mockInsertTranslationLayer,
      },
    },
  })),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    saveUtterance: mockSaveUtterance,
  },
}));

vi.mock('../services/SnapshotService', async () => {
  const actual = await vi.importActual('../services/SnapshotService');
  return {
    ...actual,
    clearRecoverySnapshot: mockClearRecoverySnapshot,
    getRecoverySnapshot: vi.fn(),
  };
});

vi.mock('../services/LayerSegmentationV2BridgeService', () => ({
  syncUtteranceTextToSegmentationV2: mockSyncUtteranceTextToSegmentationV2,
}));

function makeUtterance(id: string, updatedAt: string): UtteranceDocType {
  return {
    id,
    mediaId: 'm1',
    textId: 't1',
    startTime: 0,
    endTime: 1,
    transcription: { default: 'hello' },
    createdAt: updatedAt,
    updatedAt,
  } as UtteranceDocType;
}

function makeRecoveryDataWithTranslation(utterances: UtteranceDocType[]): RecoveryData {
  return {
    schemaVersion: 1,
    timestamp: Date.now(),
    utterances,
    translations: [{
      id: 'utr-1',
      utteranceId: utterances[0]?.id ?? 'utt-1',
      tierId: 'layer-1',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: '2026-03-23T20:00:00.000Z',
      updatedAt: '2026-03-23T20:00:00.000Z',
    }],
    layers: [],
  };
}

describe('useTranscriptionRecoveryActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByIndexAnyOf.mockResolvedValue([]);
    mockInsertUtteranceText.mockResolvedValue(undefined);
    mockInsertTranslationLayer.mockResolvedValue(undefined);
    mockSaveUtterance.mockResolvedValue(undefined);
    mockClearRecoverySnapshot.mockResolvedValue(undefined);
    mockSyncUtteranceTextToSegmentationV2.mockResolvedValue(undefined);
  });

  it('applyRecovery conflict should return false and set friendly saveState error', async () => {
    const currentUtt = makeUtterance('utt-1', '2026-03-23T20:00:00.000Z');
    mockFindByIndexAnyOf.mockResolvedValueOnce([
      {
        toJSON: () => ({ ...currentUtt, updatedAt: '2026-03-23T20:01:00.000Z' }),
      },
    ]);

    const dbNameRef = { current: 'jieyudb' };
    const utterancesRef = { current: [currentUtt] };
    const loadSnapshot = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const runWithDbMutex = async <T,>(task: () => Promise<T>) => task();

    const { result } = renderHook(() => useTranscriptionRecoveryActions({
      dbNameRef,
      utterancesRef,
      loadSnapshot,
      runWithDbMutex,
      setSaveState,
    }));

    let ok = true;
    await act(async () => {
      ok = await result.current.applyRecovery(makeRecoveryDataWithTranslation([currentUtt]));
    });

    expect(ok).toBe(false);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '恢复失败：检测到数据已被其他操作更新，请刷新后重试',
      errorMeta: expect.objectContaining({ category: 'conflict', action: '恢复' }),
    }));
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(mockClearRecoverySnapshot).not.toHaveBeenCalled();
  });

  it('applyRecovery success should return true and clear recovery snapshot', async () => {
    const currentUtt = makeUtterance('utt-1', '2026-03-23T20:00:00.000Z');
    mockFindByIndexAnyOf.mockResolvedValueOnce([
      {
        toJSON: () => ({ ...currentUtt }),
      },
    ]);

    const dbNameRef = { current: 'jieyudb' };
    const utterancesRef = { current: [currentUtt] };
    const loadSnapshot = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const runWithDbMutex = async <T,>(task: () => Promise<T>) => task();

    const { result } = renderHook(() => useTranscriptionRecoveryActions({
      dbNameRef,
      utterancesRef,
      loadSnapshot,
      runWithDbMutex,
      setSaveState,
    }));

    let ok = false;
    await act(async () => {
      ok = await result.current.applyRecovery(makeRecoveryDataWithTranslation([currentUtt]));
    });

    expect(ok).toBe(true);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'done', message: '已从崩溃恢复数据中还原' });
    expect(mockClearRecoverySnapshot).toHaveBeenCalledWith('jieyudb');
    expect(mockSyncUtteranceTextToSegmentationV2).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'utt-1' }),
      expect.objectContaining({ id: 'utr-1', utteranceId: 'utt-1' }),
    );
  });
});
