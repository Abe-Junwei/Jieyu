// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { RECOVERY_SCHEMA_VERSION, type RecoveryData } from '../../services/SnapshotService';
import type { LayerUnitDocType } from '../../db';
import { JIEYU_DEXIE_DB_NAME } from '../../db/engine';
import { useTranscriptionRecoveryActions } from './useTranscriptionRecoveryActions';

const {
  mockListUnitDocsFromCanonicalLayerUnits,
  mockClearRecoverySnapshot,
  mockImportDatabaseFromJson,
} = vi.hoisted(() => ({
  mockListUnitDocsFromCanonicalLayerUnits: vi.fn(async () => [] as LayerUnitDocType[]),
  mockClearRecoverySnapshot: vi.fn(),
  mockImportDatabaseFromJson: vi.fn(async () => ({
    importedAt: '2026-06-01T00:00:00.000Z',
    strategy: 'upsert',
    collections: {},
    ignoredCollections: [],
  })),
}));

vi.mock('../../db', () => ({
  getDb: vi.fn(async () => ({})),
  importDatabaseFromJson: mockImportDatabaseFromJson,
}));

vi.mock('../../services/LayerSegmentGraphService', () => ({
  listUnitDocsFromCanonicalLayerUnits: mockListUnitDocsFromCanonicalLayerUnits,
}));

vi.mock('../../services/SnapshotService', async () => {
  const actual = await vi.importActual('../../services/SnapshotService');
  return {
    ...actual,
    clearRecoverySnapshot: mockClearRecoverySnapshot,
    getRecoverySnapshot: vi.fn(),
  };
});

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
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    timestamp: Date.now(),
    snapshot: {
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        layer_units: units,
        layer_unit_contents: [
          {
            id: 'utr-1',
            unitId: units[0]?.id ?? 'utt-1',
            layerId: 'layer-1',
            modality: 'text',
            text: 'hello',
            sourceType: 'human',
            createdAt: '2026-03-23T20:00:00.000Z',
            updatedAt: '2026-03-23T20:00:00.000Z',
          },
        ],
        layers: [],
      },
    },
  };
}

describe('useTranscriptionRecoveryActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUnitDocsFromCanonicalLayerUnits.mockResolvedValue([]);
    mockClearRecoverySnapshot.mockResolvedValue(undefined);
  });

  it('applyRecovery conflict should return false and set friendly saveState error', async () => {
    const currentUtt = makeUnit('utt-1', '2026-03-23T20:00:00.000Z');
    mockListUnitDocsFromCanonicalLayerUnits.mockResolvedValueOnce([
      { ...currentUtt, updatedAt: '2026-03-23T20:01:00.000Z' },
    ]);

    const dbNameRef = { current: JIEYU_DEXIE_DB_NAME };
    const unitsRef = { current: [currentUtt] };
    const loadSnapshot = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const runWithDbMutex = async <T,>(task: () => Promise<T>) => task();

    const { result } = renderHook(() =>
      useTranscriptionRecoveryActions({
        dbNameRef,
        unitsRef,
        loadSnapshot,
        runWithDbMutex,
        setSaveState,
      }),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.applyRecovery(makeRecoveryDataWithTranslation([currentUtt]));
    });

    expect(ok).toBe(false);
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '恢复失败：检测到数据已被其他操作更新，请刷新后重试',
        errorMeta: expect.objectContaining({ category: 'conflict', action: '恢复' }),
      }),
    );
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(mockClearRecoverySnapshot).not.toHaveBeenCalled();
    expect(mockImportDatabaseFromJson).not.toHaveBeenCalled();
  });

  it('applyRecovery success should return true and clear recovery snapshot', async () => {
    const currentUtt = makeUnit('utt-1', '2026-03-23T20:00:00.000Z');
    mockListUnitDocsFromCanonicalLayerUnits.mockResolvedValueOnce([{ ...currentUtt }]);
    const recoveryData = makeRecoveryDataWithTranslation([currentUtt]);

    const dbNameRef = { current: JIEYU_DEXIE_DB_NAME };
    const unitsRef = { current: [currentUtt] };
    const loadSnapshot = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const runWithDbMutex = async <T,>(task: () => Promise<T>) => task();

    const { result } = renderHook(() =>
      useTranscriptionRecoveryActions({
        dbNameRef,
        unitsRef,
        loadSnapshot,
        runWithDbMutex,
        setSaveState,
      }),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.applyRecovery(recoveryData);
    });

    expect(ok).toBe(true);
    expect(mockImportDatabaseFromJson).toHaveBeenCalledWith(recoveryData.snapshot, {
      strategy: 'upsert',
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'done', message: '已从崩溃恢复数据中还原' });
    expect(mockClearRecoverySnapshot).toHaveBeenCalledWith(JIEYU_DEXIE_DB_NAME);
  });
});
