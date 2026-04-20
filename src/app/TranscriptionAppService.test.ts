import { describe, expect, it, vi } from 'vitest';
import { createTranscriptionAppService, type TranscriptionAppServiceDeps } from './TranscriptionAppService';

function createDeps(overrides: Partial<TranscriptionAppServiceDeps> = {}): TranscriptionAppServiceDeps {
  const deps: TranscriptionAppServiceDeps = {
    createProject: vi.fn(async () => ({ textId: 'text-1' })),
    createPlaceholderMedia: vi.fn(async () => ({
      id: 'media-placeholder-1',
      textId: 'text-1',
      filename: 'document-placeholder.track',
      duration: 1800,
      details: { placeholder: true, timelineMode: 'document' },
      isOfflineCached: true,
      createdAt: '2026-04-17T00:00:00.000Z',
    })),
    importAudio: vi.fn(async () => ({ mediaId: 'media-1' })),
    expandTextLogicalDurationToAtLeast: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    deleteAudio: vi.fn(async () => undefined),
    deleteSegments: vi.fn(async () => undefined),
    splitSegment: vi.fn(async () => ({
      first: { id: 'seg-left' },
      second: { id: 'seg-right' },
    } as { first: { id: string }; second: { id: string } })),
    mergeAdjacentSegments: vi.fn(async () => ({ id: 'seg-merged' } as { id: string })),
    deleteSegment: vi.fn(async () => undefined),
    updateTextTimeMapping: vi.fn(async () => ({
      id: 'text-1',
      title: { und: 'Demo' },
      metadata: { timeMapping: { offsetSec: 3, scale: 1.2, revision: 1 } },
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    })),
    previewTextTimeMapping: vi.fn(() => ({
      documentStartTime: 1,
      documentEndTime: 2,
      realStartTime: 4.2,
      realEndTime: 5.4,
      offsetSec: 3,
      scale: 1.2,
    })),
    loadAudioBuffer: vi.fn(async () => ({ duration: 3 } as AudioBuffer)),
    detectVadSegments: vi.fn(() => [{ start: 0.1, end: 0.9 }]),
    ensureVadCacheForMedia: vi.fn(async () => null),
    vadAutoWarmMaxBytes: 100,
    ...overrides,
  };
  return deps;
}

describe('TranscriptionAppService', () => {
  it('returns cached VAD segments before fallback decode', async () => {
    const deps = createDeps({
      ensureVadCacheForMedia: vi.fn(async () => ({
        engine: 'silero' as const,
        segments: [{ start: 1.0, end: 2.0 }],
        durationSec: 3,
        cachedAt: 1,
      })),
    });
    const service = createTranscriptionAppService(deps);

    const segments = await service.resolveAutoSegmentCandidates({
      mediaId: 'media-1',
      mediaUrl: 'blob:demo',
      mediaBlobSize: 16,
    });

    expect(segments).toEqual([{ start: 1.0, end: 2.0 }]);
    expect(deps.loadAudioBuffer).not.toHaveBeenCalled();
    expect(deps.detectVadSegments).not.toHaveBeenCalled();
  });

  it('skips fallback decode for oversized media', async () => {
    const deps = createDeps({
      ensureVadCacheForMedia: vi.fn(async () => null),
    });
    const service = createTranscriptionAppService(deps);

    const segments = await service.resolveAutoSegmentCandidates({
      mediaId: 'media-1',
      mediaUrl: 'https://example.com/demo.wav',
      mediaBlobSize: 101,
    });

    expect(segments).toEqual([]);
    expect(deps.loadAudioBuffer).not.toHaveBeenCalled();
    expect(deps.detectVadSegments).not.toHaveBeenCalled();
  });

  it('skips blob fallback when size is unknown', async () => {
    const deps = createDeps({
      ensureVadCacheForMedia: vi.fn(async () => null),
    });
    const service = createTranscriptionAppService(deps);

    const segments = await service.resolveAutoSegmentCandidates({
      mediaId: 'media-1',
      mediaUrl: 'blob:demo',
    });

    expect(segments).toEqual([]);
    expect(deps.loadAudioBuffer).not.toHaveBeenCalled();
  });

  it('falls back to decode+energy VAD when cache is unavailable', async () => {
    const deps = createDeps({
      ensureVadCacheForMedia: vi.fn(async () => null),
      loadAudioBuffer: vi.fn(async () => ({ duration: 5 } as AudioBuffer)),
      detectVadSegments: vi.fn(() => [{ start: 0.2, end: 0.8 }, { start: 1.1, end: 2.4 }]),
    });
    const service = createTranscriptionAppService(deps);

    const segments = await service.resolveAutoSegmentCandidates({
      mediaUrl: 'https://example.com/demo.wav',
      mediaBlobSize: 24,
    });

    expect(deps.loadAudioBuffer).toHaveBeenCalledWith('https://example.com/demo.wav');
    expect(segments).toEqual([{ start: 0.2, end: 0.8 }, { start: 1.1, end: 2.4 }]);
  });

  it('forwards project/media and segment operations to underlying dependencies', async () => {
    const deps = createDeps();
    const service = createTranscriptionAppService(deps);
    const createProjectRequest = {
      primaryTitle: 'demo',
      englishFallbackTitle: 'demo',
      primaryLanguageId: 'und',
    };
    const mappingRequest = {
      textId: 'text-1',
      offsetSec: 3,
      scale: 1.2,
      sourceMediaId: 'media-1',
    };
    const previewRequest = {
      startTime: 1,
      endTime: 2,
      offsetSec: 3,
      scale: 1.2,
    };

    await service.createProject(createProjectRequest);
    await service.createPlaceholderMedia({
      textId: 'text-1',
    });
    await service.importAudio({
      textId: 'text-1',
      audioBlob: new Blob([new Uint8Array([1, 2, 3])]),
      filename: 'demo.wav',
      duration: 12,
    });
    await service.updateTextTimeMapping(mappingRequest);
    service.previewTextTimeMapping(previewRequest);
    await service.deleteProject('text-1');
    await service.deleteAudio('media-1');
    await service.deleteSegments(['seg-1', 'seg-2']);
    await service.splitSegment('seg-1', 1.5);
    await service.mergeAdjacentSegments('seg-1', 'seg-2');
    await service.deleteSegment('seg-1');

    expect(deps.createProject).toHaveBeenCalledTimes(1);
    expect(deps.createProject).toHaveBeenCalledWith(createProjectRequest);
    expect(deps.createPlaceholderMedia).toHaveBeenCalledTimes(1);
    expect(deps.createPlaceholderMedia).toHaveBeenCalledWith({ textId: 'text-1' });
    expect(deps.importAudio).toHaveBeenCalledTimes(1);
    expect(deps.updateTextTimeMapping).toHaveBeenCalledWith(mappingRequest);
    expect(deps.previewTextTimeMapping).toHaveBeenCalledWith(previewRequest);
    expect(deps.deleteProject).toHaveBeenCalledWith('text-1');
    expect(deps.deleteAudio).toHaveBeenCalledWith('media-1');
    expect(deps.deleteSegments).toHaveBeenCalledWith(['seg-1', 'seg-2']);
    expect(deps.splitSegment).toHaveBeenCalledWith('seg-1', 1.5);
    expect(deps.mergeAdjacentSegments).toHaveBeenCalledWith('seg-1', 'seg-2');
    expect(deps.deleteSegment).toHaveBeenCalledWith('seg-1');
  });

  it('preserves underlying errors for caller handling', async () => {
    const deps = createDeps({
      splitSegment: vi.fn(async () => {
        throw new Error('split-failed');
      }),
    });
    const service = createTranscriptionAppService(deps);

    await expect(service.splitSegment('seg-1', 1.0)).rejects.toThrow('split-failed');
  });
});
