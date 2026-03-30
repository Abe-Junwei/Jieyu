// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';
import { useTranscriptionTimelineContentViewModel } from './useTranscriptionTimelineContentViewModel';

function createEmptySpeakerLayerLayout(): SpeakerLayerLayoutResult {
  return {
    placements: new Map(),
    subTrackCount: 0,
    maxConcurrentSpeakerCount: 0,
    overlapGroups: [],
    overlapCycleItemsByGroupId: new Map(),
    lockConflictCount: 0,
    lockConflictSpeakerIds: [],
  };
}

describe('useTranscriptionTimelineContentViewModel', () => {
  it('builds timeline content props with media lane duration and empty-state actions', () => {
    const click = vi.fn();
    const setLayerActionPanel = vi.fn();
    const importFileRef = { current: { click } as unknown as HTMLInputElement };
    const speakerLayerLayout = createEmptySpeakerLayerLayout();

    const { result } = renderHook(() => useTranscriptionTimelineContentViewModel({
      selectedMediaUrl: 'blob:audio',
      playerIsReady: true,
      playerDuration: 42,
      layersCount: 3,
      locale: 'zh-CN',
      importFileRef,
      layerActionSetCreateTranscription: () => setLayerActionPanel('create-transcription'),
      mediaLanesPropsInput: {
        zoomPxPerSec: 100,
        lassoRect: null,
        transcriptionLayers: [],
        translationLayers: [],
        timelineRenderUtterances: [],
        flashLayerRowId: '',
        focusedLayerRowId: '',
        activeUtteranceUnitId: '',
        selectedTimelineUnit: null,
        defaultTranscriptionLayerId: '',
        renderAnnotationItem: () => null,
        allLayersOrdered: [],
        onReorderLayers: vi.fn(),
        deletableLayers: [],
        onFocusLayer: vi.fn(),
        layerLinks: [],
        showConnectors: true,
        onToggleConnectors: vi.fn(),
        laneHeights: {},
        onLaneHeightChange: vi.fn(),
        trackDisplayMode: 'single',
        onToggleTrackDisplayMode: vi.fn(),
        onSetTrackDisplayMode: vi.fn(),
        laneLockMap: {},
        onLockSelectedSpeakersToLane: vi.fn(),
        onUnlockSelectedSpeakers: vi.fn(),
        onResetTrackAutoLayout: vi.fn(),
        selectedSpeakerNamesForLock: [],
        speakerSortKeyById: {},
        speakerLayerLayout,
        speakerFocusMode: 'all',
        onLaneLabelWidthResize: vi.fn(),
        segmentsByLayer: new Map(),
        segmentContentByLayer: new Map(),
        saveSegmentContentForLayer: vi.fn(),
        translationAudioByLayer: new Map(),
        mediaItems: [],
        recording: false,
        recordingUtteranceId: null,
        recordingLayerId: null,
        startRecordingForUtterance: vi.fn(),
        stopRecording: vi.fn(),
        deleteVoiceTranslation: vi.fn(),
      },
      textOnlyPropsInput: {
        transcriptionLayers: [],
        translationLayers: [],
        utterancesOnCurrentMedia: [],
        segmentsByLayer: new Map(),
        segmentContentByLayer: new Map(),
        saveSegmentContentForLayer: vi.fn(),
        selectedTimelineUnit: null,
        flashLayerRowId: '',
        focusedLayerRowId: '',
        defaultTranscriptionLayerId: '',
        scrollContainerRef: { current: null },
        handleAnnotationClick: vi.fn(),
        allLayersOrdered: [],
        onReorderLayers: vi.fn(),
        deletableLayers: [],
        onFocusLayer: vi.fn(),
        navigateUtteranceFromInput: vi.fn(),
        layerLinks: [],
        showConnectors: true,
        onToggleConnectors: vi.fn(),
        laneHeights: {},
        onLaneHeightChange: vi.fn(),
        trackDisplayMode: 'single',
        onToggleTrackDisplayMode: vi.fn(),
        onSetTrackDisplayMode: vi.fn(),
        laneLockMap: {},
        onLockSelectedSpeakersToLane: vi.fn(),
        onUnlockSelectedSpeakers: vi.fn(),
        onResetTrackAutoLayout: vi.fn(),
        selectedSpeakerNamesForLock: [],
        speakerLayerLayout,
        activeUtteranceUnitId: '',
        speakerFocusMode: 'all',
        speakerVisualByUtteranceId: {},
        onLaneLabelWidthResize: vi.fn(),
        translationAudioByLayer: new Map(),
        mediaItems: [],
        recording: false,
        recordingUtteranceId: null,
        recordingLayerId: null,
        startRecordingForUtterance: vi.fn(),
        stopRecording: vi.fn(),
        deleteVoiceTranslation: vi.fn(),
      },
    }));

    expect(result.current.playerDuration).toBe(42);
    expect(result.current.mediaLanesProps.playerDuration).toBe(42);
    expect(result.current.emptyStateProps.hasSelectedMedia).toBe(true);

    result.current.emptyStateProps.onCreateTranscriptionLayer();
    expect(setLayerActionPanel).toHaveBeenCalledWith('create-transcription');

    result.current.emptyStateProps.onOpenImportFile();
    expect(click).toHaveBeenCalled();
  });
});