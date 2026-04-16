// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RecoveryData } from '../services/SnapshotService';
import type { LayerUnitDocType } from '../db';
import { useTranscriptionRecoveryActions } from './useTranscriptionRecoveryActions';

const {
  mockListUnitDocsFromCanonicalLayerUnits,
  mockInsertTranslationLayer,
  mockSaveUnit,
  mockClearRecoverySnapshot,
  mockSyncUnitTextToSegmentationV2,
} = vi.hoisted(() => ({
  mockListUnitDocsFromCanonicalLayerUnits: vi.fn(async () => [] as LayerUnitDocType[]),
  mockInsertTranslationLayer: vi.fn(),
  mockSaveUnit: vi.fn(),
  mockClearRecoverySnapshot: vi.fn(),
  mockSyncUnitTextToSegmentationV2: vi.fn(async () => undefined),
}));

vi.mock('../db', () => ({
  getDb: vi.fn(async () => ({
    collections: {
      layers: {
        insert: mockInsertTranslationLayer,
      },
    },
  })),
}));

vi.mock('../services/LayerSegmentGraphService', () => ({
  listUnitDocsFromCanonicalLayerUnits: mockListUnitDocsFromCanonicalLayerUnits,
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    saveUnit: mockSaveUnit,
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

vi.mock('../services/LayerSegmentationTextService', () => ({
  syncUnitTextToSegmentationV2: mockSyncUnitTextToSegmentationV2,
}));

function makeUnit(id: string, updatedAt: string): LayerUnitDocType {
  return {
    id,
    mediaId: 'm1',
    textId: 't1',
    startTime: 0,
    endTime: 1,
    transcription: { default: 'hello' },
    createdAt: updatedAt,
    updatedAt,
  } as LayerUnitDocType;
}

function makeRecoveryDataWithTranslation(units: LayerUnitDocType[]): RecoveryData {
  return {
    schemaVersion: 1,
    timestamp: Date.now(),
    units,
    translations: [{
      id: 'utr-1',
      unitId: units[0]?.id ?? 'utt-1',
      layerId: 'layer-1',
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
    mockListUnitDocsFromCanonicalLayerUnits.mockResolvedValue([]);
    mockInsertTranslationLayer.mockResolvedValue(undefined);
    mockSaveUnit.mockResolvedValue(undefined);
    mockClearRecoverySnapshot.mockResolvedValue(undefined);
    mockSyncUnitTextToSegmentationV2.mockResolvedValue(undefined);
  });

  it('applyRecovery conflict should return false and set friendly saveState error', async () => {
    const currentUtt = makeUnit('utt-1', '2026-03-23T20:00:00.000Z');
    mockListUnitDocsFromCanonicalLayerUnits.mockResolvedValueOnce([
      { ...currentUtt, updatedAt: '2026-03-23T20:01:00.000Z' },
    ]);

    const dbNameRef = { current: 'jieyudb' };
    const unitsRef = { current: [currentUtt] };
    const loadSnapshot = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const runWithDbMutex = async <T,>(task: () => Promise<T>) => task();

    const { result } = renderHook(() => useTranscriptionRecoveryActions({
      dbNameRef,
      unitsRef,
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
    const currentUtt = makeUnit('utt-1', '2026-03-23T20:00:00.000Z');
    mockListUnitDocsFromCanonicalLayerUnits.mockResolvedValueOnce([{ ...currentUtt }]);

    const dbNameRef = { current: 'jieyudb' };
    const unitsRef = { current: [currentUtt] };
    const loadSnapshot = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const runWithDbMutex = async <T,>(task: () => Promise<T>) => task();

    const { result } = renderHook(() => useTranscriptionRecoveryActions({
      dbNameRef,
      unitsRef,
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
    expect(mockSyncUnitTextToSegmentationV2).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'utt-1' }),
      expect.objectContaining({ id: 'utr-1', unitId: 'utt-1' }),
    );
  });
});
