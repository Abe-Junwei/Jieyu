// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../../db';
import { JIEYU_DEXIE_DB_NAME } from '../../db/engine';
import { useTranscriptionRecoverySnapshotScheduler } from './useTranscriptionRecovery';

const mockSaveRecoverySnapshot = vi.hoisted(() => vi.fn());

vi.mock('../../services/SnapshotService', async () => {
  const actual = await vi.importActual('../../services/SnapshotService');
  return {
    ...actual,
    saveRecoverySnapshot: mockSaveRecoverySnapshot,
  };
});

const schedulerRefs = () => ({
  unitsRef: { current: [] as LayerUnitDocType[] },
  translationsRef: { current: [] as LayerUnitContentDocType[] },
  layersRef: { current: [] as LayerDocType[] },
});

describe('useTranscriptionRecoverySnapshotScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockSaveRecoverySnapshot.mockResolvedValue(undefined);
  });

  it('should expose scheduler state refs and recoverySave API', () => {
    const { result } = renderHook(() => useTranscriptionRecoverySnapshotScheduler(schedulerRefs()));

    expect(result.current.dbNameRef.current).toBeUndefined();
    expect(result.current.dirtyRef.current).toBe(false);
    expect(typeof result.current.recoverySave.run).toBe('function');
    expect(typeof result.current.scheduleRecoverySave).toBe('function');
  });

  it('should persist snapshot only when dirty=true and dbName exists', async () => {
    const refs = schedulerRefs();
    const { result } = renderHook(() => useTranscriptionRecoverySnapshotScheduler(refs));

    await act(async () => {
      result.current.scheduleRecoverySave();
      vi.advanceTimersByTime(3100);
    });
    expect(mockSaveRecoverySnapshot).not.toHaveBeenCalled();

    result.current.dirtyRef.current = true;
    result.current.dbNameRef.current = JIEYU_DEXIE_DB_NAME;

    await act(async () => {
      result.current.scheduleRecoverySave();
      vi.advanceTimersByTime(3100);
    });

    expect(mockSaveRecoverySnapshot).toHaveBeenCalledWith(JIEYU_DEXIE_DB_NAME, {
      liveLayerGraph: {
        layer_units: refs.unitsRef.current,
        layer_unit_contents: refs.translationsRef.current,
        layers: refs.layersRef.current,
      },
    });
  });
});
