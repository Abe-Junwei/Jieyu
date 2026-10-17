// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ITranscriptionAppServiceGateway } from '../app/TranscriptionAppService';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import { importTranscriptionProjectAudio } from './importTranscriptionProjectAudio';

describe('importTranscriptionProjectAudio', () => {
  it('reports a committed audio import separately from a failed timeline adjustment', async () => {
    const importAudio = vi.fn(async () => ({ mediaId: 'media-1' }));
    const setTextLogicalDurationSec = vi.fn(async () => {
      throw new Error('duration unavailable');
    });
    const setSaveState = vi.fn<(state: SaveState) => void>();
    const loadSnapshot = vi.fn(async () => ({ committed: true as const }));
    const tfB = vi.fn(
      (key: string, opts?: Record<string, unknown>) => `${key}:${String(opts?.filename ?? '')}`,
    );
    await expect(
      importTranscriptionProjectAudio({
        transcriptionAppService: {
          importAudio,
          setTextLogicalDurationSec,
        } as unknown as ITranscriptionAppServiceGateway,
        activeTextId: 'text-1',
        getActiveTextId: async () => 'text-1',
        setActiveTextId: vi.fn(),
        addMediaItem: vi.fn(),
        setSaveState,
        audioImportDisposition: { kind: 'simple' },
        unitsOnCurrentMedia: [],
        loadSnapshot,
        clearPendingAudioImportSelection: vi.fn(),
        locale: 'zh-CN',
        tfB,
        file: new File(['audio'], 'sample.wav', { type: 'audio/wav' }),
        duration: 10,
      }),
    ).resolves.toBeUndefined();
    expect(importAudio).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith('text-1');
    expect(setSaveState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: 'transcription.action.audioImportedDurationFailed:sample.wav',
      }),
    );
  });

  it('keeps the duration warning after a failed reload is retried', async () => {
    const states: SaveState[] = [];
    const loadSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error('reload unavailable'))
      .mockResolvedValue({ committed: true });
    await importTranscriptionProjectAudio({
      transcriptionAppService: {
        importAudio: async () => ({ mediaId: 'media-2' }),
        setTextLogicalDurationSec: async () => {
          throw new Error('duration unavailable');
        },
      } as unknown as ITranscriptionAppServiceGateway,
      activeTextId: 'text-1',
      getActiveTextId: async () => 'text-1',
      setActiveTextId: vi.fn(),
      addMediaItem: vi.fn(),
      setSaveState: (state) => states.push(state),
      audioImportDisposition: { kind: 'simple' },
      unitsOnCurrentMedia: [],
      loadSnapshot,
      clearPendingAudioImportSelection: vi.fn(),
      locale: 'zh-CN',
      tfB: (key) => key,
      file: new File(['audio'], 'sample.wav', { type: 'audio/wav' }),
      duration: 10,
    });
    const stale = states.at(-1);
    expect(stale?.kind).toBe('viewStale');
    if (stale?.kind !== 'viewStale') throw new Error('retry action missing');
    stale.onAction?.();
    await vi.waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        kind: 'error',
        message: 'transcription.action.audioImportedDurationFailed',
      }),
    );
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });
});
