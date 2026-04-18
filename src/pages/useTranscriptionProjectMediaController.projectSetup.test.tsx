// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType, MediaItemDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { useTranscriptionProjectMediaController } from './useTranscriptionProjectMediaController';

const {
  mockCreateProject,
  mockCreatePlaceholderMedia,
  mockResolveAutoSegmentCandidates,
  mockImportAudio,
  mockDeleteAudio,
  mockDeleteProject,
} = vi.hoisted(() => ({
  mockCreateProject: vi.fn(async () => ({ textId: 'text-new' })),
  mockCreatePlaceholderMedia: vi.fn(async () => ({
    id: 'media-placeholder-1',
    textId: 'text-new',
    filename: 'document-placeholder.track',
    duration: 1800,
    details: {
      placeholder: true,
      timelineMode: 'document',
      timelineKind: 'placeholder',
    },
    isOfflineCached: true,
    createdAt: '2026-04-17T00:00:00.000Z',
  } as MediaItemDocType)),
  mockResolveAutoSegmentCandidates: vi.fn(async () => []),
  mockImportAudio: vi.fn(async () => ({ mediaId: 'media-1' })),
  mockDeleteAudio: vi.fn(async () => undefined),
  mockDeleteProject: vi.fn(async () => undefined),
}));

vi.mock('../app/index', () => ({
  getTranscriptionAppService: () => ({
    createProject: mockCreateProject,
    createPlaceholderMedia: mockCreatePlaceholderMedia,
    resolveAutoSegmentCandidates: mockResolveAutoSegmentCandidates,
    importAudio: mockImportAudio,
    deleteAudio: mockDeleteAudio,
    deleteProject: mockDeleteProject,
  }),
}));

vi.mock('../hooks/useMediaImport', () => ({
  useMediaImport: () => ({
    mediaFileInputRef: { current: null },
    handleDirectMediaImport: vi.fn(async () => undefined),
  }),
}));

describe('useTranscriptionProjectMediaController project setup placeholder flow', () => {
  it('creates placeholder media after project setup and keeps audio import dialog closed', async () => {
    const setActiveTextId = vi.fn();
    const setShowAudioImport = vi.fn();
    const addMediaItem = vi.fn();
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const loadSnapshot = vi.fn(async () => undefined);

    const { result } = renderHook(() => useTranscriptionProjectMediaController({
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
      tfB: vi.fn((key: string, opts?: Record<string, unknown>) => `${key}:${String(opts?.title ?? '')}`),
      transcriptionLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
      translationLayers: [] as Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>,
      translationTextByLayer: new Map<string, Map<string, LayerUnitContentDocType>>(),
      getUnitTextForLayer: vi.fn(() => ''),
    }));

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
    expect(mockCreatePlaceholderMedia).toHaveBeenCalledWith({
      textId: 'text-new',
    });
    expect(addMediaItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-placeholder-1',
      textId: 'text-new',
      duration: 1800,
    }));
    expect(setActiveTextId).toHaveBeenCalledWith('text-new');
    expect(setShowAudioImport).toHaveBeenCalledWith(false);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });
});
