// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, MediaItemDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { useTranscriptionProjectMediaController } from './useTranscriptionProjectMediaController';

const {
  mockHandleDirectMediaImport,
  mockEnsureVadCacheForMedia,
  mockLoadAudioBuffer,
  mockDetectVadSegments,
} = vi.hoisted(() => ({
  mockHandleDirectMediaImport: vi.fn(async () => undefined),
  mockEnsureVadCacheForMedia: vi.fn(),
  mockLoadAudioBuffer: vi.fn(),
  mockDetectVadSegments: vi.fn(),
}));

vi.mock('../hooks/useMediaImport', () => ({
  useMediaImport: () => ({
    mediaFileInputRef: { current: null },
    handleDirectMediaImport: mockHandleDirectMediaImport,
  }),
}));

vi.mock('../services/vad/VadMediaCacheService', () => ({
  ensureVadCacheForMedia: (options: { mediaId?: string; mediaUrl?: string }) => mockEnsureVadCacheForMedia(options),
  VAD_AUTO_WARM_MAX_BYTES: 100 * 1024 * 1024,
}));

vi.mock('../services/VadService', () => ({
  loadAudioBuffer: (mediaUrl: string) => mockLoadAudioBuffer(mediaUrl),
  detectVadSegments: (buffer: AudioBuffer) => mockDetectVadSegments(buffer),
}));

function makeMedia(id = 'media-1'): MediaItemDocType {
  return {
    id,
    textId: 'text-1',
    filename: 'demo.wav',
    duration: 12,
    isOfflineCached: true,
    createdAt: '2026-04-08T00:00:00.000Z',
  } as MediaItemDocType;
}

function makeUnit(id: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    startTime,
    endTime,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
  } as LayerUnitDocType;
}

type HookInput = Parameters<typeof useTranscriptionProjectMediaController>[0];

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  return {
    activeTextId: 'text-1',
    getActiveTextId: vi.fn(async () => 'text-1'),
    setActiveTextId: vi.fn(),
    setShowAudioImport: vi.fn(),
    addMediaItem: vi.fn(),
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    selectedMediaUrl: 'blob:media-1',
    selectedTimelineMedia: makeMedia(),
    unitsOnCurrentMedia: [],
    createUnitFromSelectionRouted: vi.fn(async () => undefined),
    loadSnapshot: vi.fn(async () => undefined),
    selectTimelineUnit: vi.fn() as unknown as (unit: TimelineUnit | null) => void,
    locale: 'zh-CN',
    tfB: vi.fn((key: string, opts?: Record<string, unknown>) => `${key}:${String(opts?.count ?? '')}`),
    transcriptionLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
    translationLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
    translationTextByLayer: new Map<string, Map<string, LayerUnitContentDocType>>(),
    getUnitTextForLayer: vi.fn(() => ''),
    ...overrides,
  };
}

describe('useTranscriptionProjectMediaController', () => {
  beforeEach(() => {
    mockHandleDirectMediaImport.mockClear();
    mockEnsureVadCacheForMedia.mockReset();
    mockLoadAudioBuffer.mockReset();
    mockDetectVadSegments.mockReset();
  });

  it('prefers cached VAD segments when auto-segmenting', async () => {
    mockEnsureVadCacheForMedia.mockResolvedValue({
      engine: 'silero',
      segments: [
        { start: 0.1, end: 0.9, confidence: 0.94 },
        { start: 1.0, end: 1.8, confidence: 0.88 },
      ],
      durationSec: 2.4,
      cachedAt: 123,
    });
    const createUnitFromSelectionRouted = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const tfB = vi.fn((key: string, opts?: Record<string, unknown>) => `${key}:${String(opts?.count ?? '')}`);
    const { result } = renderHook(() => useTranscriptionProjectMediaController(createBaseInput({
      createUnitFromSelectionRouted,
      setSaveState,
      tfB,
      unitsOnCurrentMedia: [makeUnit('utt-1', 1.05, 1.75)],
    })));

    act(() => {
      result.current.handleAutoSegment();
    });

    await waitFor(() => {
      expect(createUnitFromSelectionRouted).toHaveBeenCalledTimes(1);
    });

    expect(mockEnsureVadCacheForMedia).toHaveBeenCalledWith({
      mediaId: 'media-1',
      mediaUrl: 'blob:media-1',
    });
    expect(createUnitFromSelectionRouted).toHaveBeenCalledWith(0.1, 0.9);
    expect(mockLoadAudioBuffer).not.toHaveBeenCalled();
    expect(mockDetectVadSegments).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenLastCalledWith({
      kind: 'done',
      message: 'transcription.projectMedia.vadDone:1',
    });
  });

  it('falls back to energy VAD when cache warmup fails', async () => {
    const audioBuffer = { duration: 3 } as AudioBuffer;
    mockEnsureVadCacheForMedia.mockResolvedValue(null);
    mockLoadAudioBuffer.mockResolvedValue(audioBuffer);
    mockDetectVadSegments.mockReturnValue([
      { start: 0.2, end: 0.7 },
      { start: 1.1, end: 2.2 },
    ]);
    const createUnitFromSelectionRouted = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useTranscriptionProjectMediaController(createBaseInput({
      createUnitFromSelectionRouted,
      setSaveState,
      selectedTimelineMedia: {
        ...makeMedia(),
        details: {
          audioBlob: new Blob([new Uint8Array(16)]),
        },
      } as MediaItemDocType,
    })));

    act(() => {
      result.current.handleAutoSegment();
    });

    await waitFor(() => {
      expect(mockLoadAudioBuffer).toHaveBeenCalledWith('blob:media-1');
    });

    expect(mockDetectVadSegments).toHaveBeenCalledWith(audioBuffer);
    expect(createUnitFromSelectionRouted).toHaveBeenNthCalledWith(1, 0.2, 0.7);
    expect(createUnitFromSelectionRouted).toHaveBeenNthCalledWith(2, 1.1, 2.2);
    expect(setSaveState).toHaveBeenLastCalledWith({
      kind: 'done',
      message: 'transcription.projectMedia.vadDone:2',
    });
  });

  it('skips loadAudioBuffer fallback when blob size is unknown', async () => {
    mockEnsureVadCacheForMedia.mockResolvedValue(null);
    const createUnitFromSelectionRouted = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useTranscriptionProjectMediaController(createBaseInput({
      createUnitFromSelectionRouted,
      setSaveState,
      selectedTimelineMedia: makeMedia(),
    })));

    act(() => {
      result.current.handleAutoSegment();
    });

    await waitFor(() => {
      expect(setSaveState).toHaveBeenLastCalledWith({
        kind: 'done',
        message: 'transcription.projectMedia.vadDone:0',
      });
    });

    expect(createUnitFromSelectionRouted).not.toHaveBeenCalled();
    expect(mockLoadAudioBuffer).not.toHaveBeenCalled();
    expect(mockDetectVadSegments).not.toHaveBeenCalled();
  });

  it('does not fall back when cached VAD detects no speech segments', async () => {
    mockEnsureVadCacheForMedia.mockResolvedValue({
      engine: 'silero',
      segments: [],
      durationSec: 2.1,
      cachedAt: 456,
    });
    const createUnitFromSelectionRouted = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useTranscriptionProjectMediaController(createBaseInput({
      createUnitFromSelectionRouted,
      setSaveState,
    })));

    act(() => {
      result.current.handleAutoSegment();
    });

    await waitFor(() => {
      expect(setSaveState).toHaveBeenLastCalledWith({
        kind: 'done',
        message: 'transcription.projectMedia.vadDone:0',
      });
    });

    expect(createUnitFromSelectionRouted).not.toHaveBeenCalled();
    expect(mockLoadAudioBuffer).not.toHaveBeenCalled();
    expect(mockDetectVadSegments).not.toHaveBeenCalled();
  });
});