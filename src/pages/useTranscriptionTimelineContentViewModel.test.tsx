// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TimelineUnitViewIndex } from '../hooks/timelineUnitView';
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

function createEmptyTimelineUnitViewIndex(): TimelineUnitViewIndex {
  const byId = new Map();
  return {
    allUnits: [],
    currentMediaUnits: [],
    byId,
    resolveBySemanticId: (id: string) => byId.get(id),
    byLayer: new Map(),
    getReferringUnits: () => [],
    totalCount: 0,
    currentMediaCount: 0,
    epoch: 1,
    fallbackToSegments: false,
    isComplete: true,
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
        timelineUnitViewIndex: createEmptyTimelineUnitViewIndex(),
        timelineRenderUnits: [],
        flashLayerRowId: '',
        focusedLayerRowId: '',
        activeUnitId: '',
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
        onLaneLabelWidthResize: vi.fn(),
        segmentsByLayer: new Map(),
        segmentContentByLayer: new Map(),
        saveSegmentContentForLayer: vi.fn(),
        translationAudioByLayer: new Map(),
        mediaItems: [],
        recording: false,
        recordingUnitId: null,
        recordingLayerId: null,
        startRecordingForUnit: vi.fn(),
        stopRecording: vi.fn(),
        deleteVoiceTranslation: vi.fn(),
      },
      textOnlyPropsInput: {
        transcriptionLayers: [],
        translationLayers: [],
        unitsOnCurrentMedia: [],
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
        navigateUnitFromInput: vi.fn(),
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
        activeUnitId: '',
        speakerVisualByUnitId: {},
        onLaneLabelWidthResize: vi.fn(),
        translationAudioByLayer: new Map(),
        mediaItems: [],
        recording: false,
        recordingUnitId: null,
        recordingLayerId: null,
        startRecordingForUnit: vi.fn(),
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

  it('picks up comparisonViewEnabled when textOnlyPropsInput is reused and mutated in place', () => {
    const click = vi.fn();
    const setLayerActionPanel = vi.fn();
    const importFileRef = { current: { click } as unknown as HTMLInputElement };
    const speakerLayerLayout = createEmptySpeakerLayerLayout();

    const textOnlyPropsInput = {
      transcriptionLayers: [],
      translationLayers: [],
      unitsOnCurrentMedia: [],
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
      navigateUnitFromInput: vi.fn(),
      layerLinks: [],
      showConnectors: true,
      onToggleConnectors: vi.fn(),
      laneHeights: {},
      onLaneHeightChange: vi.fn(),
      trackDisplayMode: 'single' as const,
      onToggleTrackDisplayMode: vi.fn(),
      onSetTrackDisplayMode: vi.fn(),
      laneLockMap: {},
      onLockSelectedSpeakersToLane: vi.fn(),
      onUnlockSelectedSpeakers: vi.fn(),
      onResetTrackAutoLayout: vi.fn(),
      selectedSpeakerNamesForLock: [],
      speakerLayerLayout,
      activeUnitId: '',
      speakerVisualByUnitId: {},
      onLaneLabelWidthResize: vi.fn(),
      translationAudioByLayer: new Map(),
      mediaItems: [],
      recording: false,
      recordingUnitId: null,
      recordingLayerId: null,
      startRecordingForUnit: vi.fn(),
      stopRecording: vi.fn(),
      deleteVoiceTranslation: vi.fn(),
    };

    const baseInput = {
      selectedMediaUrl: 'blob:audio',
      playerIsReady: true,
      playerDuration: 42,
      layersCount: 3,
      locale: 'zh-CN' as const,
      importFileRef,
      layerActionSetCreateTranscription: () => setLayerActionPanel('create-transcription'),
      mediaLanesPropsInput: {
        zoomPxPerSec: 100,
        lassoRect: null,
        transcriptionLayers: [],
        translationLayers: [],
        timelineUnitViewIndex: createEmptyTimelineUnitViewIndex(),
        timelineRenderUnits: [],
        flashLayerRowId: '',
        focusedLayerRowId: '',
        activeUnitId: '',
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
        trackDisplayMode: 'single' as const,
        onToggleTrackDisplayMode: vi.fn(),
        onSetTrackDisplayMode: vi.fn(),
        laneLockMap: {},
        onLockSelectedSpeakersToLane: vi.fn(),
        onUnlockSelectedSpeakers: vi.fn(),
        onResetTrackAutoLayout: vi.fn(),
        selectedSpeakerNamesForLock: [],
        speakerSortKeyById: {},
        speakerLayerLayout,
        onLaneLabelWidthResize: vi.fn(),
        segmentsByLayer: new Map(),
        segmentContentByLayer: new Map(),
        saveSegmentContentForLayer: vi.fn(),
        translationAudioByLayer: new Map(),
        mediaItems: [],
        recording: false,
        recordingUnitId: null,
        recordingLayerId: null,
        startRecordingForUnit: vi.fn(),
        stopRecording: vi.fn(),
        deleteVoiceTranslation: vi.fn(),
      },
      textOnlyPropsInput,
    };

    const { result, rerender } = renderHook(
      (props: typeof baseInput) => useTranscriptionTimelineContentViewModel(props),
      { initialProps: baseInput },
    );

    expect(result.current.textOnlyProps.comparisonViewEnabled).toBeUndefined();

    Object.assign(textOnlyPropsInput, { comparisonViewEnabled: true as const });
    rerender({ ...baseInput, textOnlyPropsInput });

    expect(result.current.textOnlyProps.comparisonViewEnabled).toBe(true);
  });
});