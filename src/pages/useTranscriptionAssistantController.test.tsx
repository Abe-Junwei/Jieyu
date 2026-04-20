// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { unitToView } from '../hooks/timelineUnitView';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';

const {
  mockBridgeTextForLayerTarget,
  mockResolveFallbackSourceOrthographyId,
} = vi.hoisted(() => ({
  mockBridgeTextForLayerTarget: vi.fn(async ({ text }: { text: string }) => text),
  mockResolveFallbackSourceOrthographyId: vi.fn(({ layers, selectedLayerId }: { layers: Array<{ layerType: string; orthographyId?: string }>; selectedLayerId?: string | null }) => {
    const normalizedSelectedLayerId = selectedLayerId?.trim();
    if (normalizedSelectedLayerId) return undefined;
    return layers.find((layer) => layer.layerType === 'transcription')?.orthographyId?.trim();
  }),
}));

vi.mock('../utils/orthographyRuntime', () => ({
  resolveFallbackSourceOrthographyId: mockResolveFallbackSourceOrthographyId,
  bridgeTextForLayerTarget: mockBridgeTextForLayerTarget,
}));

function makeLayer(
  id: string,
  layerType: LayerDocType['layerType'] = 'transcription',
  extras?: Pick<LayerDocType, 'parentLayerId'>,
): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType,
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    ...(extras ?? {}),
  } as LayerDocType;
}

function makeUnit(id: string, overrides: Partial<LayerUnitDocType> = {}): LayerUnitDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    ...overrides,
  } as LayerUnitDocType;
}

type HookInput = Parameters<typeof useTranscriptionAssistantController>[0];

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  const unit = makeUnit('utt-1');
  const translationLayer = makeLayer('layer-tr', 'translation');
  const transcriptionLayer = makeLayer('layer-main');

  return {
    state: {
      phase: 'ready',
      dbName: 'jieyu',
      unitCount: 1,
      translationLayerCount: 1,
    },
    unitsLength: 1,
    translationLayersLength: 1,
    aiConfidenceAvg: 0.9,
    selectedPrimaryUnitView: unitToView(unit, transcriptionLayer.id),
    selectedTimelineOwnerUnit: unit,
    selectedTimelineRowMeta: { rowNumber: 1, start: 0, end: 1 },
    selectedAiWarning: false,
    lexemeMatches: [{ id: 'lex-1', lemma: { eng: 'hello' } }],
    handleOpenWordNote: vi.fn(),
    handleOpenMorphemeNote: vi.fn(),
    handleUpdateTokenPos: vi.fn(),
    handleBatchUpdateTokenPosByForm: vi.fn(),
    aiPanelMode: 'auto',
    setAiPanelMode: vi.fn() as unknown as Dispatch<SetStateAction<NonNullable<AiPanelContextValue['aiPanelMode']>>>,
    aiCurrentTask: 'transcription',
    aiVisibleCards: undefined,
    selectedTranslationGapCount: 2,
    vadCacheStatus: { state: 'ready', engine: 'silero', segmentCount: 4 },
    acousticSummary: null,
    handleJumpToTranslationGap: vi.fn(),
    handleJumpToAcousticHotspot: vi.fn(),
    setAiPanelContext: vi.fn() as unknown as Dispatch<SetStateAction<AiPanelContextValue>>,
    selectedTimelineUnit: null as TimelineUnit | null,
    saveSegmentContentForLayer: vi.fn(async () => undefined),
    selectedLayerId: null,
    defaultTranscriptionLayerId: transcriptionLayer.id,
    translationLayers: [translationLayer],
    layers: [transcriptionLayer, translationLayer],
    unitsOnCurrentMedia: [unit],
    getUnitTextForLayer: vi.fn(() => ''),
    saveUnitText: vi.fn(async () => undefined),
    saveUnitLayerText: vi.fn(async () => undefined),
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    nextUnitIdForVoiceDictation: 'utt-2',
    selectUnit: vi.fn(),
    aiChatEnabled: true,
    aiChatSettings: {
      provider: 'mock',
      baseUrl: '',
      apiKey: '',
      model: '',
    } as unknown as HookInput['aiChatSettings'],
    pushUndo: vi.fn(),
    setUnits: vi.fn() as unknown as Dispatch<SetStateAction<LayerUnitDocType[]>>,
    ...overrides,
  };
}

describe('useTranscriptionAssistantController', () => {
  it('transforms dictation text before writing to the default transcription layer when no layer is explicitly selected', async () => {
    mockBridgeTextForLayerTarget.mockResolvedValueOnce('xf:translated text');
    const saveUnitText = vi.fn(async () => undefined);
    const selectUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedLayerId: null,
      layers: [
        { ...makeLayer('layer-main'), orthographyId: 'orth-source' } as LayerDocType,
        { ...makeLayer('layer-tr', 'translation'), orthographyId: 'orth-target' } as LayerDocType,
      ],
      saveUnitText: saveUnitText,
      selectUnit,
    })));

    act(() => {
      result.current.handleVoiceDictation('translated text');
    });

    await waitFor(() => {
      expect(mockBridgeTextForLayerTarget).toHaveBeenCalledWith({
        text: 'translated text',
        layers: expect.arrayContaining([
          expect.objectContaining({ id: 'layer-main', orthographyId: 'orth-source' }),
          expect.objectContaining({ id: 'layer-tr', orthographyId: 'orth-target' }),
        ]),
        targetLayerId: 'layer-main',
        selectedLayerId: null,
        fallbackSourceOrthographyId: 'orth-source',
      });
      expect(saveUnitText).toHaveBeenCalledWith('utt-1', 'xf:translated text', 'layer-main');
      expect(selectUnit).toHaveBeenCalledWith('utt-2');
    });
  });

  it('publishes AI panel context with derived ready-state stats', async () => {
    const handleJumpToAcousticHotspot = vi.fn();
    const setAiPanelContext = vi.fn() as unknown as Dispatch<SetStateAction<AiPanelContextValue>>;

    renderHook(() => useTranscriptionAssistantController(createBaseInput({
      setAiPanelContext,
      acousticSummary: {
        selectionStartSec: 1,
        selectionEndSec: 2,
        f0MinHz: 120,
        f0MaxHz: 180,
        f0MeanHz: 150,
        intensityPeakDb: -10,
        reliabilityMean: 0.8,
        voicedFrameCount: 8,
        frameCount: 10,
      },
      acousticInspector: {
        source: 'spectrogram',
        timeSec: 1.45,
        frequencyHz: 312,
        f0Hz: 154,
        intensityDb: -18.4,
        matchedHotspotKind: 'pitch_break',
        matchedHotspotTimeSec: 1.5,
        inSelection: true,
      },
      acousticDetail: {
        mediaKey: 'media-1',
        sampleRate: 16000,
        algorithmVersion: 'yin-v2-spectral',
        modelVersion: 'none',
        persistenceVersion: 'phase1-v2',
        frameStepSec: 0.01,
        analysisWindowSec: 0.04,
        yinThreshold: 0.15,
        silenceRmsThreshold: 0.01,
        selectionStartSec: 1,
        selectionEndSec: 2,
        sampleCount: 3,
        voicedSampleCount: 3,
        frames: [
          { timeSec: 1.1, relativeTimeSec: 0.1, timeRatio: 0.1, f0Hz: 132, intensityDb: -20, reliability: 0.72, normalizedF0: 0.1, normalizedIntensity: 0.2 },
          { timeSec: 1.4, relativeTimeSec: 0.4, timeRatio: 0.4, f0Hz: 154, intensityDb: -18.4, reliability: 0.8, normalizedF0: 0.56, normalizedIntensity: 0.55 },
          { timeSec: 1.8, relativeTimeSec: 0.8, timeRatio: 0.8, f0Hz: 168, intensityDb: -16.2, reliability: 0.86, normalizedF0: 0.84, normalizedIntensity: 0.8 },
        ],
        toneBins: [
          { index: 0, timeSec: 1.1, timeRatio: 0, f0Hz: 132, intensityDb: -20, reliability: 0.72, normalizedF0: 0.1, normalizedIntensity: 0.2 },
          { index: 1, timeSec: 1.4, timeRatio: 0.5, f0Hz: 154, intensityDb: -18.4, reliability: 0.8, normalizedF0: 0.56, normalizedIntensity: 0.55 },
          { index: 2, timeSec: 1.8, timeRatio: 1, f0Hz: 168, intensityDb: -16.2, reliability: 0.86, normalizedF0: 0.84, normalizedIntensity: 0.8 },
        ],
      },
      acousticBatchDetails: [
        {
          selectionId: 'utt-1',
          selectionLabel: 'utt-1',
          calibrationStatus: 'exploratory',
          detail: {
            mediaKey: 'media-1',
            sampleRate: 16000,
            algorithmVersion: 'yin-v2-spectral',
            modelVersion: 'none',
            persistenceVersion: 'phase1-v2',
            frameStepSec: 0.01,
            analysisWindowSec: 0.04,
            yinThreshold: 0.15,
            silenceRmsThreshold: 0.01,
            selectionStartSec: 1,
            selectionEndSec: 2,
            sampleCount: 2,
            voicedSampleCount: 2,
            frames: [
              { timeSec: 1.1, relativeTimeSec: 0.1, timeRatio: 0.1, f0Hz: 132, intensityDb: -20, reliability: 0.72, normalizedF0: 0.1, normalizedIntensity: 0.2 },
              { timeSec: 1.4, relativeTimeSec: 0.4, timeRatio: 0.4, f0Hz: 154, intensityDb: -18.4, reliability: 0.8, normalizedF0: 0.56, normalizedIntensity: 0.55 },
            ],
            toneBins: [
              { index: 0, timeSec: 1.1, timeRatio: 0, f0Hz: 132, intensityDb: -20, reliability: 0.72, normalizedF0: 0.1, normalizedIntensity: 0.2 },
              { index: 1, timeSec: 1.4, timeRatio: 1, f0Hz: 154, intensityDb: -18.4, reliability: 0.8, normalizedF0: 0.56, normalizedIntensity: 0.55 },
            ],
          },
        },
        {
          selectionId: 'utt-2',
          selectionLabel: 'utt-2',
          calibrationStatus: 'exploratory',
          detail: {
            mediaKey: 'media-1',
            sampleRate: 16000,
            algorithmVersion: 'yin-v2-spectral',
            modelVersion: 'none',
            persistenceVersion: 'phase1-v2',
            frameStepSec: 0.01,
            analysisWindowSec: 0.04,
            yinThreshold: 0.15,
            silenceRmsThreshold: 0.01,
            selectionStartSec: 2,
            selectionEndSec: 3,
            sampleCount: 2,
            voicedSampleCount: 2,
            frames: [
              { timeSec: 2.1, relativeTimeSec: 0.1, timeRatio: 0.1, f0Hz: 162, intensityDb: -17.8, reliability: 0.75, normalizedF0: 0.1, normalizedIntensity: 0.2 },
              { timeSec: 2.4, relativeTimeSec: 0.4, timeRatio: 0.4, f0Hz: 171, intensityDb: -15.9, reliability: 0.82, normalizedF0: 0.56, normalizedIntensity: 0.55 },
            ],
            toneBins: [
              { index: 0, timeSec: 2.1, timeRatio: 0, f0Hz: 162, intensityDb: -17.8, reliability: 0.75, normalizedF0: 0.1, normalizedIntensity: 0.2 },
              { index: 1, timeSec: 2.4, timeRatio: 1, f0Hz: 171, intensityDb: -15.9, reliability: 0.82, normalizedF0: 0.56, normalizedIntensity: 0.55 },
            ],
          },
        },
      ],
      handleJumpToAcousticHotspot,
    })));

    await waitFor(() => {
      expect(setAiPanelContext).toHaveBeenCalledWith(expect.objectContaining({
        dbName: 'jieyu',
        unitCount: 1,
        translationLayerCount: 1,
        selectedTranslationGapCount: 2,
        vadCacheStatus: { state: 'ready', engine: 'silero', segmentCount: 4 },
        acousticSummary: expect.objectContaining({
          selectionStartSec: 1,
          selectionEndSec: 2,
        }),
        acousticInspector: expect.objectContaining({
          source: 'spectrogram',
          timeSec: 1.45,
          matchedHotspotKind: 'pitch_break',
        }),
        acousticDetail: expect.objectContaining({
          selectionStartSec: 1,
          selectionEndSec: 2,
          sampleCount: 3,
        }),
        acousticBatchDetails: expect.arrayContaining([
          expect.objectContaining({ selectionId: 'utt-1' }),
          expect.objectContaining({ selectionId: 'utt-2' }),
        ]),
        onJumpToAcousticHotspot: handleJumpToAcousticHotspot,
      }));
    });
  });

  it('writes dictation to segment content with fallback orthography transform for segment-backed selection', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUnitText = vi.fn(async () => undefined);
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' };
    mockBridgeTextForLayerTarget.mockResolvedValueOnce('xf:segment text');
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedLayerId: null,
      selectedTimelineUnit,
      layers: [
        { ...makeLayer('layer-main'), orthographyId: 'orth-source' } as LayerDocType,
        { ...makeLayer('layer-seg', 'translation'), orthographyId: 'orth-target' } as LayerDocType,
      ],
      saveSegmentContentForLayer,
      saveUnitText: saveUnitText,
    })));

    act(() => {
      result.current.handleVoiceDictation('segment text');
    });

    await waitFor(() => {
      expect(mockBridgeTextForLayerTarget).toHaveBeenCalledWith({
        text: 'segment text',
        layers: expect.arrayContaining([
          expect.objectContaining({ id: 'layer-main', orthographyId: 'orth-source' }),
          expect.objectContaining({ id: 'layer-seg', orthographyId: 'orth-target' }),
        ]),
        targetLayerId: 'layer-seg',
        selectedLayerId: null,
        fallbackSourceOrthographyId: 'orth-source',
      });
      expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'layer-seg', 'xf:segment text');
    });
    expect(saveUnitText).not.toHaveBeenCalled();
  });

  it('persists dictation to the default transcription layer and auto-advances', async () => {
    const saveUnitText = vi.fn(async () => undefined);
    const selectUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedLayerId: null,
      saveUnitText: saveUnitText,
      selectUnit,
    })));

    act(() => {
      result.current.handleVoiceDictation('translated text');
    });

    await waitFor(() => {
      expect(saveUnitText).toHaveBeenCalledWith('utt-1', 'translated text', 'layer-main');
      expect(selectUnit).toHaveBeenCalledWith('utt-2');
    });
  });

  it('persists dictation to host child translation layer when selected/default layers are not provided', async () => {
    const saveUnitText = vi.fn(async () => undefined);
    const saveUnitLayerText = vi.fn(async () => undefined);
    const selectUnit = vi.fn();
    const transcriptionMain = makeLayer('layer-main', 'transcription');
    const transcriptionFr = makeLayer('layer-fr', 'transcription');
    const translationEn = makeLayer('layer-tr-en', 'translation', { parentLayerId: 'layer-main' });
    const translationFr = makeLayer('layer-tr-fr', 'translation', { parentLayerId: 'layer-fr' });
    const {
      defaultTranscriptionLayerId: _ignoreDefaultTranscriptionLayerId,
      ...hookInputWithoutDefaultTranscription
    } = createBaseInput({
      selectedLayerId: null,
      selectedTimelineUnit: { layerId: 'layer-fr', unitId: 'utt-1', kind: 'unit' },
      layers: [transcriptionMain, transcriptionFr, translationEn, translationFr],
      translationLayers: [translationEn, translationFr],
      saveUnitText,
      saveUnitLayerText,
      selectUnit,
    });
    const { result } = renderHook(() => useTranscriptionAssistantController(hookInputWithoutDefaultTranscription));

    act(() => {
      result.current.handleVoiceDictation('bonjour');
    });

    await waitFor(() => {
      expect(saveUnitLayerText).toHaveBeenCalledWith('utt-1', 'bonjour', 'layer-tr-fr');
      expect(saveUnitText).not.toHaveBeenCalled();
      expect(selectUnit).toHaveBeenCalledWith('utt-2');
    });

    expect(result.current.voiceDictationPipeline?.config?.targetLayer).toBe('translation');
  });

  it('builds a continuous dictation pipeline for unit-based voice dictation', async () => {
    const unit1 = makeUnit('utt-1');
    const unit2 = makeUnit('utt-2');
    const getUnitTextForLayer = vi.fn((unit: LayerUnitDocType) => (unit.id === 'utt-1' ? '' : '已有内容'));
    const saveUnitText = vi.fn(async () => undefined);
    const selectUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      unitsOnCurrentMedia: [unit1, unit2],
      getUnitTextForLayer,
      saveUnitText: saveUnitText,
      selectUnit,
    })));

    expect(result.current.voiceDictationPipeline?.config?.targetLayer).toBe('transcription');

    const segments = result.current.voiceDictationPipeline?.callbacks.getSegments();
    expect(segments).toEqual([
      expect.objectContaining({ segmentId: 'utt-1', existingText: null }),
      expect.objectContaining({ segmentId: 'utt-2', existingText: '已有内容' }),
    ]);

    await result.current.voiceDictationPipeline?.callbacks.fillSegment('utt-1', 'transcription', 'voice text');
    expect(saveUnitText).toHaveBeenCalledWith('utt-1', 'voice text', 'layer-main');

    result.current.voiceDictationPipeline?.callbacks.navigateTo('utt-2');
    expect(selectUnit).toHaveBeenCalledWith('utt-2');
  });

  it('does not write direct voice dictation into a skip-processing unit', async () => {
    const skippedUnit = makeUnit('utt-skip', { tags: { skipProcessing: true } });
    const saveUnitText = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedTimelineOwnerUnit: skippedUnit,
      unitsOnCurrentMedia: [skippedUnit],
      saveUnitText,
      setSaveState,
      nextUnitIdForVoiceDictation: 'utt-next',
    })));

    act(() => {
      result.current.handleVoiceDictation('should-not-write');
    });

    await waitFor(() => {
      expect(saveUnitText).not.toHaveBeenCalled();
      expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'error',
      }));
    });
  });

  it('skips LLM voice intent resolution when AI chat is disabled', async () => {
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      aiChatEnabled: false,
    })));

    await expect(result.current.handleResolveVoiceIntentWithLlm({
      text: '播放',
      mode: 'command',
      session: { id: 'session-1', startedAt: 0, entries: [], mode: 'command' },
    })).resolves.toBeNull();
  });
});