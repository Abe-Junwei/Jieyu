// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
} from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import { useTranscriptionProjectMediaController } from './useTranscriptionProjectMediaController';

const {
  mockCreateProject,
  mockCreatePlaceholderMedia,
  mockResolveAutoSegmentRun,
  mockImportAudio,
  mockDeleteAudio,
  mockDeleteProject,
} = vi.hoisted(() => ({
  mockCreateProject: vi.fn(async () => ({ textId: 'text-new' })),
  mockCreatePlaceholderMedia: vi.fn(
    async () =>
      ({
        id: 'media-placeholder-1',
        textId: 'text-new',
        filename: 'document-placeholder.track',
        duration: 1800,
        details: {
          placeholder: true,
          timelineMode: 'document',
        },
        isOfflineCached: true,
        timelineKind: 'placeholder',
        byteLocation: 'none',
        availability: 'missing',
        createdAt: '2026-04-17T00:00:00.000Z',
      }) as MediaItemDocType,
  ),
  mockResolveAutoSegmentRun: vi.fn(async () => ({
    segments: [],
    provenance: {},
    run: { engine: 'energy', source: 'fresh' },
  })),
  mockImportAudio: vi.fn(async () => ({ mediaId: 'media-1' })),
  mockDeleteAudio: vi.fn(async () => undefined),
  mockDeleteProject: vi.fn(async () => undefined),
}));

vi.mock('../app/TranscriptionAppService', () => ({
  getTranscriptionAppService: () => ({
    createProject: mockCreateProject,
    createPlaceholderMedia: mockCreatePlaceholderMedia,
    resolveAutoSegmentRun: mockResolveAutoSegmentRun,
    importAudio: mockImportAudio,
    deleteAudio: mockDeleteAudio,
    deleteProject: mockDeleteProject,
  }),
}));

vi.mock('../hooks/media/useMediaImport', () => ({
  useMediaImport: () => ({
    mediaFileInputRef: { current: null },
    handleDirectMediaImport: vi.fn(async () => undefined),
  }),
}));

describe('useTranscriptionProjectMediaController project setup placeholder flow', () => {
  it('does not create placeholder media on project setup; first layer creation adds placeholder via shell', async () => {
    const setActiveTextId = vi.fn();
    const setShowAudioImport = vi.fn();
    const addMediaItem = vi.fn();
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const loadSnapshot = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useTranscriptionProjectMediaController({
        activeTextId: null,
        mediaItems: [],
        getActiveTextId: vi.fn(async () => null),
        setActiveTextId,
        setShowAudioImport,
        addMediaItem,
        setSaveState,
        selectedMediaUrl: null,
        selectedTimelineMedia: null,
        unitsOnCurrentMedia: [] as LayerUnitDocType[],
        createUnitFromSelectionRouted: vi.fn(async () => undefined),
        loadSnapshot,
        selectTimelineUnit: vi.fn() as unknown as (unit: TimelineUnit | null) => void,
        locale: 'zh-CN',
        tfB: vi.fn(
          (key: string, opts?: Record<string, unknown>) => `${key}:${String(opts?.title ?? '')}`,
        ),
        transcriptionLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
        translationLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
        translationTextByLayer: new Map<string, Map<string, LayerUnitContentDocType>>(),
        getUnitTextForLayer: vi.fn(() => ''),
      }),
    );

    await act(async () => {
      await result.current.handleProjectSetupSubmit({
        primaryTitle: 'My Project',
        englishFallbackTitle: 'My Project',
        primaryLanguageId: 'eng',
      });
    });

    expect(mockCreateProject).toHaveBeenCalledWith({
      primaryTitle: 'My Project',
      englishFallbackTitle: 'My Project',
      primaryLanguageId: 'eng',
    });
    expect(mockCreatePlaceholderMedia).not.toHaveBeenCalled();
    expect(addMediaItem).not.toHaveBeenCalled();
    expect(setActiveTextId).toHaveBeenCalledWith('text-new');
    expect(setShowAudioImport).toHaveBeenCalledWith(false);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('reports a stale view when refresh fails after the project is created', async () => {
    const setActiveTextId = vi.fn();
    const setSaveState = vi.fn();
    const loadSnapshot = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    const { result } = renderHook(() =>
      useTranscriptionProjectMediaController({
        activeTextId: null,
        mediaItems: [],
        getActiveTextId: vi.fn(async () => null),
        setActiveTextId,
        setShowAudioImport: vi.fn(),
        addMediaItem: vi.fn(),
        setSaveState,
        selectedMediaUrl: null,
        selectedTimelineMedia: null,
        unitsOnCurrentMedia: [] as LayerUnitDocType[],
        createUnitFromSelectionRouted: vi.fn(async () => undefined),
        loadSnapshot,
        selectTimelineUnit: vi.fn() as unknown as (unit: TimelineUnit | null) => void,
        locale: 'zh-CN',
        tfB: vi.fn(
          (key: string, opts?: Record<string, unknown>) => `${key}:${String(opts?.title ?? '')}`,
        ),
        transcriptionLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
        translationLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
        translationTextByLayer: new Map<string, Map<string, LayerUnitContentDocType>>(),
        getUnitTextForLayer: vi.fn(() => ''),
      }),
    );

    await act(async () => {
      await result.current.handleProjectSetupSubmit({
        primaryTitle: 'My Project',
        englishFallbackTitle: 'My Project',
        primaryLanguageId: 'eng',
      });
    });

    expect(setActiveTextId).toHaveBeenCalledWith('text-new');
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'viewStale', actionLabel: '重新刷新' }),
    );
    expect(setSaveState).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });

  it('reports a stale view when refresh fails after the audio delete returns', async () => {
    mockDeleteAudio.mockResolvedValue(undefined);
    const setSaveState = vi.fn();
    const loadSnapshot = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    const media = {
      id: 'media-1',
      textId: 'text-1',
      filename: 'demo.wav',
      duration: 12,
      isOfflineCached: true,
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
      createdAt: '2026-04-08T00:00:00.000Z',
    } as MediaItemDocType;
    const { result } = renderHook(() =>
      useTranscriptionProjectMediaController({
        activeTextId: 'text-1',
        mediaItems: [media],
        getActiveTextId: vi.fn(async () => 'text-1'),
        setActiveTextId: vi.fn(),
        setShowAudioImport: vi.fn(),
        addMediaItem: vi.fn(),
        setSaveState,
        selectedMediaUrl: 'blob:media-1',
        selectedTimelineMedia: media,
        unitsOnCurrentMedia: [] as LayerUnitDocType[],
        createUnitFromSelectionRouted: vi.fn(async () => undefined),
        loadSnapshot,
        selectTimelineUnit: vi.fn() as unknown as (unit: TimelineUnit | null) => void,
        locale: 'zh-CN',
        tfB: vi.fn((key: string) => key),
        transcriptionLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
        translationLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
        translationTextByLayer: new Map<string, Map<string, LayerUnitContentDocType>>(),
        getUnitTextForLayer: vi.fn(() => ''),
      }),
    );

    act(() => {
      result.current.handleConfirmAudioDelete();
    });

    await waitFor(() => {
      expect(setSaveState).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'viewStale', actionLabel: '重新刷新' }),
      );
    });
    expect(mockDeleteAudio).toHaveBeenCalledWith('media-1');
    expect(setSaveState).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });
});
