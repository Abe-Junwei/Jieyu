// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { useTranscriptionShellController } from './useTranscriptionShellController';

const {
  mockCreateProject,
  mockGetMediaItemsByTextId,
  mockEnsureDocumentTimeline,
  mockCreatePlaceholderMedia,
  mockCreateLayer,
  mockGetActiveTextId,
  mockSetActiveTextId,
} = vi.hoisted(() => ({
  mockCreateProject: vi.fn(async () => ({ textId: 'text-existing' })),
  mockGetMediaItemsByTextId: vi.fn(async () => []),
  mockEnsureDocumentTimeline: vi.fn(async () => ({
    id: 'text-existing',
    title: { und: 'Demo' },
    metadata: { timelineMode: 'document' },
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-18T00:00:00.000Z',
  })),
  mockCreatePlaceholderMedia: vi.fn(async () => ({
    id: 'media-placeholder',
    textId: 'text-existing',
    filename: 'document-placeholder.track',
    duration: 1800,
    details: { placeholder: true, timelineMode: 'document' },
    isOfflineCached: true,
    createdAt: '2026-04-18T00:00:00.000Z',
  })),
  mockCreateLayer: vi.fn(async () => true),
  mockGetActiveTextId: vi.fn(async () => 'text-existing'),
  mockSetActiveTextId: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    createProject: mockCreateProject,
    getMediaItemsByTextId: mockGetMediaItemsByTextId,
    ensureDocumentTimeline: mockEnsureDocumentTimeline,
    createPlaceholderMedia: mockCreatePlaceholderMedia,
  },
}));

vi.mock('../hooks/useLayerActionPanel', () => ({
  useLayerActionPanel: () => ({}),
}));

vi.mock('../hooks/useDialogs', () => ({
  useDialogs: () => ({
    showProjectSetup: false,
    setShowProjectSetup: vi.fn(),
    showAudioImport: false,
    setShowAudioImport: vi.fn(),
    showSearch: false,
    setShowSearch: vi.fn(),
    showUndoHistory: false,
    setShowUndoHistory: vi.fn(),
    activeTextId: 'text-existing',
    setActiveTextId: mockSetActiveTextId,
    activeTextPrimaryLanguageId: 'eng',
    activeTextPrimaryOrthographyId: null,
    activeTextTimelineMode: 'document',
    activeTextTimeMapping: null,
    getActiveTextId: mockGetActiveTextId,
    getActiveTextPrimaryLanguageId: vi.fn(async () => 'eng'),
    getActiveTextTimelineMode: vi.fn(async () => 'document'),
  }),
}));

vi.mock('./useTranscriptionAdaptiveSizing', () => ({
  useTranscriptionAdaptiveSizing: () => ({
    uiFontScale: 1,
    uiFontScaleMode: 'manual',
    setUiFontScale: vi.fn(),
    resetUiFontScale: vi.fn(),
    uiTextDirection: 'ltr',
    adaptiveDialogWidth: 640,
    adaptiveDialogCompactWidth: 480,
    adaptiveDialogWideWidth: 960,
  }),
}));

vi.mock('../hooks/usePanelToggles', () => ({
  usePanelToggles: () => ({
    isAiPanelCollapsed: false,
    setIsAiPanelCollapsed: vi.fn(),
    aiPanelWidth: 320,
    setAiPanelWidth: vi.fn(),
    handleAiPanelToggle: vi.fn(),
    isHubCollapsed: false,
    hubHeight: 240,
    setHubHeight: vi.fn(),
  }),
}));

describe('useTranscriptionShellController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveTextId.mockResolvedValue('text-existing');
    mockGetMediaItemsByTextId.mockResolvedValue([]);
    mockCreateLayer.mockResolvedValue(true);
  });

  it('provisions document mode when creating a layer in a project with no audio', async () => {
    const orderedLayers: LayerDocType[] = [];

    const { result } = renderHook(() => useTranscriptionShellController({
      units: [],
      selectedLayerId: '',
      setSelectedLayerId: vi.fn(),
      orderedLayers,
      layerLinks: [],
      deletableLayers: [],
      layerCreateMessage: '',
      setLayerCreateMessage: vi.fn(),
      createLayer: mockCreateLayer,
      deleteLayer: vi.fn(async () => undefined),
    }));

    await act(async () => {
      await result.current.createLayerWithActiveContext('transcription', {
        languageId: 'eng',
      }, 'text');
    });

    expect(mockGetMediaItemsByTextId).toHaveBeenCalledWith('text-existing');
    expect(mockEnsureDocumentTimeline).toHaveBeenCalledWith({ textId: 'text-existing' });
    expect(mockCreatePlaceholderMedia).not.toHaveBeenCalled();
    expect(mockCreateLayer).toHaveBeenCalledWith('transcription', expect.objectContaining({
      textId: 'text-existing',
      languageId: 'eng',
    }), 'text');
  });
});
