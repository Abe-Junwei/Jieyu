// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LayerDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { useTranscriptionRecoverySnapshotScheduler } from './useTranscriptionRecovery';

const mockSaveRecoverySnapshot = vi.hoisted(() => vi.fn());

vi.mock('../services/SnapshotService', async () => {
  const actual = await vi.importActual('../services/SnapshotService');
  return {
    ...actual,
    saveRecoverySnapshot: mockSaveRecoverySnapshot,
  };
});

function makeUtterance(id: string): UtteranceDocType {
  const now = new Date().toISOString();
  return {
    id,
    mediaId: 'm1',
    textId: 't1',
    startTime: 0,
    endTime: 1,
    transcription: { default: id },
    createdAt: now,
    updatedAt: now,
  } as UtteranceDocType;
}

describe('useTranscriptionRecoverySnapshotScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockSaveRecoverySnapshot.mockResolvedValue(undefined);
  });

  it('should expose scheduler state refs and recoverySave API', () => {
    const { result } = renderHook(() => useTranscriptionRecoverySnapshotScheduler({
      utterancesRef: { current: [] as UtteranceDocType[] },
      translationsRef: { current: [] as UtteranceTextDocType[] },
      layersRef: { current: [] as LayerDocType[] },
    }));

    expect(result.current.dbNameRef.current).toBeUndefined();
    expect(result.current.dirtyRef.current).toBe(false);
    expect(typeof result.current.recoverySave.run).toBe('function');
    expect(typeof result.current.scheduleRecoverySave).toBe('function');
  });

  it('should persist snapshot only when dirty=true and dbName exists', async () => {
    const utterances = [makeUtterance('u1')];
    const translations: UtteranceTextDocType[] = [];
    const layers: LayerDocType[] = [];

    const { result } = renderHook(() => useTranscriptionRecoverySnapshotScheduler({
      utterancesRef: { current: utterances },
      translationsRef: { current: translations },
      layersRef: { current: layers },
    }));

    await act(async () => {
      result.current.scheduleRecoverySave();
      vi.advanceTimersByTime(3100);
    });
    expect(mockSaveRecoverySnapshot).not.toHaveBeenCalled();

    result.current.dirtyRef.current = true;
    result.current.dbNameRef.current = 'jieyudb';

    await act(async () => {
      result.current.scheduleRecoverySave();
      vi.advanceTimersByTime(3100);
    });

    expect(mockSaveRecoverySnapshot).toHaveBeenCalledWith('jieyudb', {
      utterances,
      translations,
      layers,
    });
  });
});
