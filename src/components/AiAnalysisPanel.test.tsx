// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LayerUnitDocType } from '../db';
import { JIEYU_DEXIE_DB_NAME } from '../db/engine';
import { unitToView } from '../hooks/timelineUnitView';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import { ACOUSTIC_PROVIDER_STORAGE_KEYS } from '../services/acoustic/acousticProviderContract';
import { AiPanelContext, DEFAULT_AI_PANEL_CONTEXT_VALUE, type AiPanelContextValue } from '../contexts/AiPanelContext';
import { EmbeddingProvider, DEFAULT_EMBEDDING_CONTEXT_VALUE, type EmbeddingContextValue } from '../contexts/EmbeddingContext';
import { pickEmbeddingContextValue } from '../hooks/useEmbeddingContextValue';

function ensureLocalStorageApi(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentStorage = window.localStorage as Partial<Storage> | undefined;
  const hasFullApi = Boolean(
    currentStorage
    && typeof currentStorage.getItem === 'function'
    && typeof currentStorage.setItem === 'function'
    && typeof currentStorage.removeItem === 'function'
    && typeof currentStorage.clear === 'function'
    && typeof currentStorage.key === 'function',
  );

  if (hasFullApi) {
    return;
  }

  const store = new Map<string, string>();
  const fallbackStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: fallbackStorage,
  });
}

function safeClearLocalStorage(): void {
  if (typeof window === 'undefined' || typeof window.localStorage?.clear !== 'function') {
    return;
  }
  window.localStorage.clear();
}

function makeUnit(overrides: Partial<LayerUnitDocType> = {}): LayerUnitDocType {
  return {
    id: 'utt-1',
    mediaId: 'media-1',
    startTime: 1,
    endTime: 2,
    transcription: { default: 'hello world' },
    words: [],
    ...overrides,
  } as unknown as LayerUnitDocType;
}

function makeContextValue(overrides: Partial<AiPanelContextValue> = {}): AiPanelContextValue {
  const defaultDoc = makeUnit();
  return {
    ...DEFAULT_AI_PANEL_CONTEXT_VALUE,
    dbName: JIEYU_DEXIE_DB_NAME,
    unitCount: 1,
    translationLayerCount: 1,
    selectedUnit: unitToView(defaultDoc, 'layer-default'),
    lexemeMatches: [],
    ...overrides,
  };
}

function makeEmbeddingContextValue(overrides: Partial<EmbeddingContextValue> = {}): EmbeddingContextValue {
  return pickEmbeddingContextValue({
    ...DEFAULT_EMBEDDING_CONTEXT_VALUE,
    ...overrides,
  });
}

describe('AiAnalysisPanel embedding integration', () => {
  beforeEach(() => {
    ensureLocalStorageApi();
    safeClearLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    safeClearLocalStorage();
  });

  function setupProviderHealthPanel(): HTMLElement {
    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );
    return container;
  }

  function enableExternalProviderForHealthCheck(
    container: HTMLElement,
    options: { endpoint?: string; timeoutMs?: number } = {},
  ): void {
    fireEvent.click(within(container).getByLabelText(/启用外部 provider|Enable external provider/i));

    if (typeof options.endpoint === 'string') {
      fireEvent.change(within(container).getByLabelText(/外部 endpoint|External endpoint/i), {
        target: { value: options.endpoint },
      });
    } else {
      fireEvent.change(within(container).getByLabelText(/外部 endpoint|External endpoint/i), {
        target: { value: 'https://provider.example.dev/analyze' },
      });
    }

    if (typeof options.timeoutMs === 'number') {
      fireEvent.change(within(container).getByLabelText(/超时|Timeout/i), {
        target: { value: String(options.timeoutMs) },
      });
    }
  }

  it('invokes similarity search callback from embedding card', () => {
    const onFindSimilarUnits = vi.fn().mockResolvedValue(undefined);
    const unitDoc = makeUnit();
    const baseContext = makeContextValue({ selectedUnit: unitToView(unitDoc, 'layer-default') });
    const embeddingContext = makeEmbeddingContextValue({
      selectedUnit: unitDoc,
      onFindSimilarUnits,
    });

    render(
      <AiPanelContext.Provider value={baseContext}>
        <EmbeddingProvider value={embeddingContext}>
          <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const findSimilarBtn = screen.getByRole('button', { name: /Find Similar|检索相似句/i });
    fireEvent.click(findSimilarBtn);

    expect(onFindSimilarUnits).toHaveBeenCalledTimes(1);
  });

  it('invokes jump callback and highlights active similarity match', () => {
    const onJumpToEmbeddingMatch = vi.fn();
    const unitDoc = makeUnit({ id: 'utt-2' });
    const baseContext = makeContextValue({
      selectedUnit: unitToView(unitDoc, 'layer-default'),
    });
    const embeddingContext = makeEmbeddingContextValue({
      selectedUnit: unitDoc,
      aiEmbeddingMatches: [
        {
          unitId: 'utt-2',
          score: 0.93,
          label: 'U2',
          text: 'matched text',
        },
      ],
      onJumpToEmbeddingMatch,
    });

    render(
      <AiPanelContext.Provider value={baseContext}>
        <EmbeddingProvider value={embeddingContext}>
          <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const matchBtn = screen.getByRole('button', { name: /U2/i });
    expect(matchBtn.className).toContain('ai-embed-match-btn-active');

    fireEvent.click(matchBtn);
    expect(onJumpToEmbeddingMatch).toHaveBeenCalledWith('utt-2');
  });

  it('does not render AI chat decision logs inside analysis panel after hub decoupling', () => {
    render(
      <AiPanelContext.Provider value={makeContextValue()}>
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(screen.queryByText(/最近 AI 决策日志|Recent AI Decisions/i)).toBeNull();
    expect(screen.queryByText(/delete_layer/)).toBeNull();
    expect(screen.queryByText(/已取消执行|Cancelled/i)).toBeNull();
  });

  it('does not render pending high-risk preview in analysis panel after hub decoupling', () => {
    render(
      <AiPanelContext.Provider value={makeContextValue()}>
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(screen.queryByText(/高风险工具调用待确认|High-risk tool call pending confirmation/i)).toBeNull();
    expect(screen.queryByText(/风险摘要|Risk summary/i)).toBeNull();
    expect(screen.queryByText(/Target layer: layer-jp/)).toBeNull();
  });

  it('renders embedding fallback warning when provided', () => {
    const baseContext = makeContextValue();
    const embeddingCtx = makeEmbeddingContextValue({ aiEmbeddingWarning: 'Running fallback embedding (model unavailable). Retrieval quality may degrade.' });

    render(
      <AiPanelContext.Provider value={baseContext}>
        <EmbeddingProvider value={embeddingCtx}>
          <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(screen.getByText(/fallback embedding/i)).toBeTruthy();
  });

  it('renders standardized header, summary, and footer shell for stats tab', () => {
    const baseContext = makeContextValue({
      aiCurrentTask: 'risk_review',
      aiConfidenceAvg: 0.88,
    });

    const { container } = render(
      <AiPanelContext.Provider value={baseContext}>
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="stats" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(container.querySelector('.transcription-analysis-panel-header')).toBeTruthy();
    expect(container.querySelector('.transcription-analysis-panel-body')).toBeTruthy();
    expect(container.querySelector('.transcription-analysis-panel-footer')).toBeTruthy();
    expect(container.querySelector('.transcription-analysis-panel-summary')).toBeTruthy();
    expect(container.querySelector('.transcription-analysis-stats-section')).toBeTruthy();
    expect(screen.getAllByText(/Risk review|风险复核/i).length).toBeGreaterThan(0);
  });

  it('keeps the highlighted stats label aligned with the current task', () => {
    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        aiCurrentTask: 'translation',
        aiConfidenceAvg: 0.91,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="stats" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(within(container).getAllByText(/Translation|翻译/i).length).toBeGreaterThan(0);
    expect(within(container).queryByText(/Risk review|风险复核/i)).toBeNull();
  });

  it('renders VAD cache status in stats tab', () => {
    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        aiCurrentTask: 'transcription',
        vadCacheStatus: { state: 'ready', engine: 'silero', segmentCount: 3 },
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="stats" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const statsSection = container.querySelector('.transcription-analysis-stats-section');
    expect(statsSection).toBeTruthy();
    expect(within(statsSection as HTMLElement).getByText(/VAD 缓存|VAD cache/i)).toBeTruthy();
    expect(within(statsSection as HTMLElement).getByText(/silero/i)).toBeTruthy();
    expect(within(statsSection as HTMLElement).getByText(/3 段|3 segments/i)).toBeTruthy();
  });

  it('renders VAD warmup progress in stats tab', () => {
    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        aiCurrentTask: 'transcription',
        vadCacheStatus: { state: 'warming', engine: 'silero', progressRatio: 0.5, processedFrames: 16, totalFrames: 32 },
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="stats" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const statsSection = container.querySelector('.transcription-analysis-stats-section');
    expect(statsSection).toBeTruthy();
    expect(within(statsSection as HTMLElement).getByText(/50%/i)).toBeTruthy();
    expect(within(statsSection as HTMLElement).getByText(/16\/32/i)).toBeTruthy();
  });

  it('renders acoustic runtime progress while analysis is still loading', () => {
    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'loading', phase: 'analyzing', progressRatio: 0.4, processedFrames: 8, totalFrames: 20 },
        vadCacheStatus: { state: 'warming', engine: 'silero', progressRatio: 0.5, processedFrames: 16, totalFrames: 32 },
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(within(container).getAllByText(/40%/i).length).toBeGreaterThan(0);
    expect(within(container).getAllByText(/8\/20/i).length).toBeGreaterThan(0);
    expect(within(container).getByText(/50%/i)).toBeTruthy();
  });

  it('renders dedicated acoustic tab content and supports jumping to hotspots', async () => {
    const onJumpToAcousticHotspot = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:acoustic-export');
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', { configurable: true, value: anchorClick });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1, processedFrames: 20, totalFrames: 20 },
        acousticSummary: {
          selectionStartSec: 1.2,
          selectionEndSec: 3.4,
          f0MinHz: 120,
          f0MeanHz: 195,
          f0MaxHz: 280,
          durationSec: 2.2,
          intensityMinDb: -27,
          intensityPeakDb: -12,
          reliabilityMean: 0.82,
          voicedFrameCount: 18,
          frameCount: 24,
          voicedRatio: 0.75,
          spectralCentroidMeanHz: 1180,
          spectralRolloffMeanHz: 2520,
          zeroCrossingRateMean: 0.048,
          spectralFlatnessMean: 0.231,
          loudnessMeanDb: -17.4,
          mfccMeanCoefficients: [12.4, -3.2, 1.9],
          formantF1MeanHz: 560,
          formantF2MeanHz: 1760,
          vowelSpaceSpread: 220,
          sampleRateHz: 16000,
          algorithmVersion: 'yin-v2-spectral',
          analysisWindowSec: 0.04,
          frameStepSec: 0.01,
          diagnostics: ['wide_pitch_range'],
          hotspots: [
            { kind: 'pitch_break', timeSec: 2.1, score: 0.9, startSec: 2.0, endSec: 2.12, f0Hz: 244, reliability: 0.67 },
            { kind: 'intensity_peak', timeSec: 2.8, score: 0.8 },
          ],
        },
        acousticInspector: {
          source: 'spectrogram',
          timeSec: 2.08,
          frequencyHz: 612,
          f0Hz: 241,
          intensityDb: -13.2,
          matchedHotspotKind: 'pitch_break',
          matchedHotspotTimeSec: 2.1,
          inSelection: true,
        },
        pinnedInspector: {
          source: 'spectrogram',
          timeSec: 2.04,
          frequencyHz: 580,
          f0Hz: 225,
          intensityDb: -14.6,
          matchedHotspotKind: 'pitch_break',
          matchedHotspotTimeSec: 2.1,
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
          selectionStartSec: 1.2,
          selectionEndSec: 3.4,
          sampleCount: 5,
          voicedSampleCount: 5,
          frames: [
            { timeSec: 2.0, relativeTimeSec: 0.8, timeRatio: 0.36, f0Hz: 212, intensityDb: -16.8, reliability: 0.66, spectralCentroidHz: 980, spectralRolloffHz: 2120, zeroCrossingRate: 0.036, spectralFlatness: 0.182, loudnessDb: -19.8, mfccCoefficients: [11.8, -3.9, 1.2], formantF1Hz: 490, formantF2Hz: 1500, formantReliability: 0.52, normalizedF0: 0.18, normalizedIntensity: 0.22 },
            { timeSec: 2.04, relativeTimeSec: 0.84, timeRatio: 0.38, f0Hz: 225, intensityDb: -14.6, reliability: 0.7, spectralCentroidHz: 1120, spectralRolloffHz: 2320, zeroCrossingRate: 0.042, spectralFlatness: 0.204, loudnessDb: -18.4, mfccCoefficients: [12.0, -3.5, 1.5], formantF1Hz: 520, formantF2Hz: 1640, formantReliability: 0.58, normalizedF0: 0.34, normalizedIntensity: 0.48 },
            { timeSec: 2.08, relativeTimeSec: 0.88, timeRatio: 0.4, f0Hz: 241, intensityDb: -13.2, reliability: 0.76, spectralCentroidHz: 1264, spectralRolloffHz: 2710, zeroCrossingRate: 0.052, spectralFlatness: 0.231, loudnessDb: -17.4, mfccCoefficients: [12.4, -3.2, 1.9], formantF1Hz: 560, formantF2Hz: 1760, formantReliability: 0.62, normalizedF0: 0.54, normalizedIntensity: 0.64 },
            { timeSec: 2.12, relativeTimeSec: 0.92, timeRatio: 0.42, f0Hz: 256, intensityDb: -12.6, reliability: 0.81, spectralCentroidHz: 1310, spectralRolloffHz: 2830, zeroCrossingRate: 0.056, spectralFlatness: 0.252, loudnessDb: -16.8, mfccCoefficients: [12.9, -2.9, 2.2], formantF1Hz: 590, formantF2Hz: 1860, formantReliability: 0.66, normalizedF0: 0.72, normalizedIntensity: 0.76 },
            { timeSec: 2.16, relativeTimeSec: 0.96, timeRatio: 0.44, f0Hz: 272, intensityDb: -12.1, reliability: 0.86, spectralCentroidHz: 1360, spectralRolloffHz: 2920, zeroCrossingRate: 0.06, spectralFlatness: 0.267, loudnessDb: -16.0, mfccCoefficients: [13.2, -2.5, 2.4], formantF1Hz: 640, formantF2Hz: 1940, formantReliability: 0.7, normalizedF0: 0.92, normalizedIntensity: 0.88 },
          ],
          toneBins: [
            { index: 0, timeSec: 1.3, timeRatio: 0, f0Hz: 120, intensityDb: -26, reliability: 0.62, normalizedF0: 0.05, normalizedIntensity: 0.1 },
            { index: 1, timeSec: 1.9, timeRatio: 0.3, f0Hz: 168, intensityDb: -19, reliability: 0.7, normalizedF0: 0.28, normalizedIntensity: 0.35 },
            { index: 2, timeSec: 2.2, timeRatio: 0.5, f0Hz: 224, intensityDb: -14, reliability: 0.8, normalizedF0: 0.58, normalizedIntensity: 0.7 },
            { index: 3, timeSec: 2.8, timeRatio: 0.8, f0Hz: 252, intensityDb: -12.5, reliability: 0.84, normalizedF0: 0.8, normalizedIntensity: 0.82 },
            { index: 4, timeSec: 3.3, timeRatio: 1, f0Hz: 280, intensityDb: -12, reliability: 0.88, normalizedF0: 1, normalizedIntensity: 0.9 },
          ],
        },
        onJumpToAcousticHotspot,
      })}>
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(within(container).getAllByText(/^声学摘要$|^Acoustic Summary$/i).length).toBeGreaterThan(0);
    expect(within(container).getByText(/1.20-3.40s/i)).toBeTruthy();
    expect(within(container).getAllByText(/音高断裂|Pitch break/i).length).toBeGreaterThan(0);
    expect(within(container).getByText(/音高跨度较大|Pitch range is wide/i)).toBeTruthy();
    expect(within(container).getByText(/谱描述|Spectral Descriptors/i)).toBeTruthy();
    expect(within(container).getByText(/1180 Hz/i)).toBeTruthy();
    expect(within(container).getByText(/2520 Hz/i)).toBeTruthy();
    expect(within(container).getByText(/4.8%/i)).toBeTruthy();
    expect(within(container).getAllByText(/0.231/i).length).toBeGreaterThan(0);
    expect(within(container).getAllByText(/-17.4 dB/i).length).toBeGreaterThan(0);
    expect(within(container).getAllByText(/12.40 \/ -3.20 \/ 1.90/i).length).toBeGreaterThan(0);
    expect(within(container).getByText(/运行参数|Runtime Parameters/i)).toBeTruthy();
    expect(within(container).getByText(/yin-v2-spectral/i)).toBeTruthy();
    expect(within(container).getByText(/Formant and Vowel Space|Formant 与元音空间/i)).toBeTruthy();
    expect(within(container).getAllByText(/560 Hz/i).length).toBeGreaterThan(0);
    expect(within(container).getAllByText(/1760 Hz/i).length).toBeGreaterThan(0);
    expect(
      within(container).getByText(/频谱 hover|Spectrogram hover/i, {
        selector: '.transcription-analysis-stats-value',
      }),
    ).toBeTruthy();
    expect(within(container).getByText(/局部切片|Local Slice/i)).toBeTruthy();
    expect(within(container).getByText(/声调与能量轮廓|Tone and Energy Contour/i)).toBeTruthy();
    expect(within(container).getByText(/612 Hz/i)).toBeTruthy();
    expect(within(container).getByText(/Δ 谱质心|Δ Spectral centroid/i)).toBeTruthy();
    expect(within(container).getByText(/Δ 频谱滚降|Δ Spectral rolloff/i)).toBeTruthy();
    expect(within(container).getByText(/Δ F1/i)).toBeTruthy();
    expect(within(container).getByText(/Δ F2/i)).toBeTruthy();
    expect(within(container).getByText(/144 Hz/i)).toBeTruthy();
    expect(within(container).getByText(/390 Hz/i)).toBeTruthy();
    expect(within(container).getByText(/40 Hz/i)).toBeTruthy();
    expect(within(container).getByText(/120 Hz/i)).toBeTruthy();
    expect(within(container).getByRole('button', { name: /跳到关联热点|Jump to linked hotspot/i })).toBeTruthy();
    expect(within(container).getByRole('button', { name: /跳到最强热点|Jump to top hotspot/i })).toBeTruthy();
    expect(within(container).getByRole('button', { name: /导出 CSV|Export CSV/i })).toBeTruthy();

    fireEvent.click(within(container).getByRole('button', { name: /音高断裂|Pitch break/i }));
    expect(onJumpToAcousticHotspot).toHaveBeenCalledWith(2.1);

    fireEvent.click(within(container).getByRole('button', { name: /跳到关联热点|Jump to linked hotspot/i }));
    expect(onJumpToAcousticHotspot).toHaveBeenLastCalledWith(2.1);

    fireEvent.click(within(container).getByRole('button', { name: /跳到最强热点|Jump to top hotspot/i }));
    expect(onJumpToAcousticHotspot).toHaveBeenLastCalledWith(2.1);

    fireEvent.click(within(container).getByRole('button', { name: /导出 CSV|Export CSV/i }));
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    createElementSpy.mockRestore();
  });

  it('restores acoustic navigation interactions after runtime recovers from error', () => {
    const onSelectHotspot = vi.fn();
    const onJumpToAcousticHotspot = vi.fn();

    const { container, rerender } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'error', errorMessage: 'network failed' },
        acousticSummary: null,
        acousticDetail: null,
        onSelectHotspot,
        onJumpToAcousticHotspot,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(within(container).getAllByText(/分析失败|Analysis failed/i).length).toBeGreaterThan(0);
    expect(within(container).getByText(/可展开查看错误详情|Expand for details/i)).toBeTruthy();
    expect(within(container).getByText(/错误详情|Error details/i)).toBeTruthy();
    expect(within(container).getByText(/network failed/i)).toBeTruthy();

    rerender(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1, processedFrames: 20, totalFrames: 20 },
        selectedHotspotTimeSec: 2.1,
        acousticSummary: {
          selectionStartSec: 1.2,
          selectionEndSec: 3.4,
          f0MinHz: 120,
          f0MeanHz: 195,
          f0MaxHz: 280,
          intensityPeakDb: -12,
          reliabilityMean: 0.82,
          voicedFrameCount: 18,
          frameCount: 24,
          hotspots: [
            { kind: 'pitch_break', timeSec: 2.1, score: 0.9, startSec: 2.0, endSec: 2.12, f0Hz: 244, reliability: 0.67 },
          ],
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
          selectionStartSec: 1.2,
          selectionEndSec: 3.4,
          sampleCount: 3,
          voicedSampleCount: 3,
          frames: [
            { timeSec: 2.0, relativeTimeSec: 0.8, timeRatio: 0.36, f0Hz: 212, intensityDb: -16.8, reliability: 0.66, normalizedF0: 0.18, normalizedIntensity: 0.22 },
            { timeSec: 2.08, relativeTimeSec: 0.88, timeRatio: 0.4, f0Hz: 241, intensityDb: -13.2, reliability: 0.76, normalizedF0: 0.54, normalizedIntensity: 0.64 },
            { timeSec: 2.16, relativeTimeSec: 0.96, timeRatio: 0.44, f0Hz: 272, intensityDb: -12.1, reliability: 0.86, normalizedF0: 0.92, normalizedIntensity: 0.88 },
          ],
          toneBins: [
            { index: 0, timeSec: 1.3, timeRatio: 0, f0Hz: 120, intensityDb: -26, reliability: 0.62, normalizedF0: 0.05, normalizedIntensity: 0.1 },
            { index: 1, timeSec: 2.2, timeRatio: 0.5, f0Hz: 224, intensityDb: -14, reliability: 0.8, normalizedF0: 0.58, normalizedIntensity: 0.7 },
            { index: 2, timeSec: 3.3, timeRatio: 1, f0Hz: 280, intensityDb: -12, reliability: 0.88, normalizedF0: 1, normalizedIntensity: 0.9 },
          ],
        },
        onSelectHotspot,
        onJumpToAcousticHotspot,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const hotspotButtons = within(container).getAllByRole('button', { name: /音高断裂|Pitch break/i });
    const selectedHotspotButton = hotspotButtons.find((node) => node.getAttribute('aria-pressed') === 'true');
    expect(selectedHotspotButton).toBeTruthy();

    fireEvent.click(within(container).getByRole('button', { name: /跳到选区起点|Jump to selection start/i }));
    expect(onSelectHotspot).toHaveBeenCalledWith(null);
    expect(onJumpToAcousticHotspot).toHaveBeenCalledWith(1.2);

    fireEvent.click(within(container).getByRole('button', { name: /跳到最强热点|Jump to top hotspot/i }));
    expect(onSelectHotspot).toHaveBeenCalledWith(2.1);
    expect(onJumpToAcousticHotspot).toHaveBeenCalledWith(2.1);
  });

  it('applies preset updates only after clicking apply', () => {
    const onChangeAcousticConfig = vi.fn();

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
        onChangeAcousticConfig,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const presetSelect = container.querySelector('.transcription-analysis-acoustic-preset-select') as HTMLSelectElement;
    expect(presetSelect).toBeTruthy();

    fireEvent.change(presetSelect, { target: { value: 'tonal' } });

    expect(onChangeAcousticConfig).toHaveBeenCalledTimes(0);

    fireEvent.click(within(container).getByRole('button', { name: /应用参数|Apply parameters/i }));

    expect(onChangeAcousticConfig).toHaveBeenCalledWith(expect.objectContaining({
      pitchFloorHz: 75,
      pitchCeilingHz: 500,
      frameStepSec: 0.005,
      yinThreshold: 0.12,
    }), { replace: true });
  });

  it('resets acoustic draft and applies reset after confirmation click', () => {
    const onResetAcousticConfig = vi.fn();
    const onChangeAcousticConfig = vi.fn();

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
        onChangeAcousticConfig,
        onResetAcousticConfig,
        acousticConfigOverride: {
          pitchFloorHz: 75,
          pitchCeilingHz: 500,
          frameStepSec: 0.005,
          yinThreshold: 0.12,
        },
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    fireEvent.click(within(container).getByRole('button', { name: /重置参数草稿|Reset parameter draft/i }));
    expect(onResetAcousticConfig).toHaveBeenCalledTimes(0);

    fireEvent.click(within(container).getByRole('button', { name: /应用参数|Apply parameters/i }));
    expect(onResetAcousticConfig).toHaveBeenCalledTimes(1);
  });

  it('clamps numeric acoustic config inputs in draft and applies once', () => {
    const onChangeAcousticConfig = vi.fn();

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
        onChangeAcousticConfig,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const pitchFloorInput = within(container).getByLabelText(/基频下限|Pitch floor/i) as HTMLInputElement;

    fireEvent.change(pitchFloorInput, { target: { value: '' } });
    expect(onChangeAcousticConfig).toHaveBeenCalledTimes(0);

    fireEvent.change(pitchFloorInput, { target: { value: '10' } });
    expect(onChangeAcousticConfig).toHaveBeenCalledTimes(0);

    fireEvent.change(pitchFloorInput, { target: { value: '900' } });
    expect(onChangeAcousticConfig).toHaveBeenCalledTimes(0);

    fireEvent.click(within(container).getByRole('button', { name: /应用参数|Apply parameters/i }));
    expect(onChangeAcousticConfig).toHaveBeenLastCalledWith({ pitchFloorHz: 500 }, { replace: true });

    expect(within(container).getByText(/已启用自定义参数|Custom parameters active/i)).toBeTruthy();
  });

  it('enables batch selection export scope and disables PitchTier in batch mode', async () => {
    const createObjectURL = vi.fn(() => 'blob:acoustic-batch-export');
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', { configurable: true, value: anchorClick });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });

    const sharedDetail = {
      mediaKey: 'media-1',
      sampleRate: 16000,
      algorithmVersion: 'yin-v2-spectral',
      modelVersion: 'none',
      persistenceVersion: 'phase1-v2',
      frameStepSec: 0.01,
      analysisWindowSec: 0.04,
      yinThreshold: 0.15,
      silenceRmsThreshold: 0.01,
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
    };

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1, processedFrames: 20, totalFrames: 20 },
        acousticDetail: {
          ...sharedDetail,
          selectionStartSec: 1,
          selectionEndSec: 2,
        },
        acousticDetailFullMedia: {
          ...sharedDetail,
          selectionStartSec: 0,
          selectionEndSec: 6,
        },
        acousticBatchDetails: [
          {
            selectionId: 'utt-1',
            selectionLabel: 'utt-1',
            calibrationStatus: 'exploratory',
            detail: {
              ...sharedDetail,
              selectionStartSec: 1,
              selectionEndSec: 2,
            },
          },
          {
            selectionId: 'utt-2',
            selectionLabel: 'utt-2',
            calibrationStatus: 'exploratory',
            detail: {
              ...sharedDetail,
              selectionStartSec: 2,
              selectionEndSec: 3,
            },
          },
        ],
        acousticBatchSelectionCount: 3,
        acousticBatchDroppedSelectionRanges: [
          {
            selectionId: 'utt-empty',
            selectionLabel: 'utt-empty',
            selectionStartSec: 9,
            selectionEndSec: 9.2,
          },
        ],
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    fireEvent.click(within(container).getByRole('button', { name: /批量选区|Batch selections/i }));

    const pitchTierBtn = within(container).getByRole('button', { name: /导出 PitchTier|Export PitchTier/i }) as HTMLButtonElement;
    expect(pitchTierBtn.disabled).toBe(true);
    expect(within(container).getByText(/已选 3 个，导出 2 个，跳过 1 个|3 selected, 2 exportable, 1 skipped/i)).toBeTruthy();
    expect(within(container).getByText(/utt-empty/i)).toBeTruthy();

    fireEvent.click(within(container).getByRole('button', { name: /导出 JSON|Export JSON/i }));
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    createElementSpy.mockRestore();
  });

  it('blocks oversized batch export and surfaces visible error', async () => {
    const createObjectURL = vi.fn(() => 'blob:acoustic-batch-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });

    const baseFrame = {
      timeSec: 1.1,
      relativeTimeSec: 0.1,
      timeRatio: 0.1,
      f0Hz: 132,
      intensityDb: -20,
      reliability: 0.72,
      normalizedF0: 0.1,
      normalizedIntensity: 0.2,
    };

    const oversizedFrames = Array.from({ length: 130_000 }, (_, index) => ({
      ...baseFrame,
      timeSec: 1 + (index * 0.01),
      relativeTimeSec: index * 0.01,
      timeRatio: Math.min(1, index / 130_000),
    }));

    const oversizedDetail = {
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
      sampleCount: oversizedFrames.length,
      voicedSampleCount: oversizedFrames.length,
      frames: oversizedFrames,
      toneBins: [
        { index: 0, timeSec: 1.1, timeRatio: 0, f0Hz: 132, intensityDb: -20, reliability: 0.72, normalizedF0: 0.1, normalizedIntensity: 0.2 },
        { index: 1, timeSec: 1.4, timeRatio: 1, f0Hz: 154, intensityDb: -18.4, reliability: 0.8, normalizedF0: 0.56, normalizedIntensity: 0.55 },
      ],
    };

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1, processedFrames: 20, totalFrames: 20 },
        acousticDetail: oversizedDetail,
        acousticDetailFullMedia: oversizedDetail,
        acousticBatchDetails: [
          {
            selectionId: 'utt-1',
            selectionLabel: 'utt-1',
            calibrationStatus: 'exploratory',
            detail: oversizedDetail,
          },
          {
            selectionId: 'utt-2',
            selectionLabel: 'utt-2',
            calibrationStatus: 'exploratory',
            detail: oversizedDetail,
          },
        ],
        acousticBatchSelectionCount: 2,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    fireEvent.click(within(container).getByRole('button', { name: /批量选区|Batch selections/i }));
    fireEvent.click(within(container).getByRole('button', { name: /导出 JSON|Export JSON/i }));

    await waitFor(() => {
      expect(within(container).getByText(/导出数据过大|Export payload is too large/i)).toBeTruthy();
    });
    expect(createObjectURL).toHaveBeenCalledTimes(0);
    expect(revokeObjectURL).toHaveBeenCalledTimes(0);
  });

  it('cleans up export worker when postMessage throws and falls back to sync export', async () => {
    const createObjectURL = vi.fn(() => 'blob:acoustic-worker-fallback-export');
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.fn();
    const postMessage = vi.fn(() => {
      throw new Error('DataCloneError');
    });
    const terminate = vi.fn();
    const originalWorker = globalThis.Worker;
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', { configurable: true, value: anchorClick });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
    (globalThis as { Worker: unknown }).Worker = class MockWorker {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = postMessage;
      terminate = terminate;
    } as unknown as Worker;

    const detail = {
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
    };

    try {
      const { container } = render(
        <AiPanelContext.Provider value={makeContextValue({
          acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1, processedFrames: 20, totalFrames: 20 },
          acousticDetail: detail,
        })}
        >
          <EmbeddingProvider value={makeEmbeddingContextValue()}>
            <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
          </EmbeddingProvider>
        </AiPanelContext.Provider>,
      );

      fireEvent.click(within(container).getByRole('button', { name: /导出 CSV|Export CSV/i }));

      await waitFor(() => {
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(terminate).toHaveBeenCalledTimes(1);
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(anchorClick).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      });

      expect(within(container).queryByText(/导出失败|Export failed/i)).toBeNull();
    } finally {
      (globalThis as { Worker: typeof Worker }).Worker = originalWorker;
      createElementSpy.mockRestore();
    }
  });

  it('saves provider runtime config and triggers provider state refresh callback', () => {
    const onRefreshAcousticProviderState = vi.fn();

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
        onRefreshAcousticProviderState,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const endpointInput = within(container).getByLabelText(/外部 endpoint|External endpoint/i) as HTMLInputElement;
    const apiKeyInput = within(container).getByLabelText(/API Key|API key/i) as HTMLInputElement;
    const timeoutInput = within(container).getByLabelText(/超时|Timeout/i) as HTMLInputElement;
    const enableCheckbox = within(container).getByLabelText(/启用外部 provider|Enable external provider/i) as HTMLInputElement;

    fireEvent.change(endpointInput, { target: { value: 'https://provider.example.dev/analyze' } });
    fireEvent.change(apiKeyInput, { target: { value: 'secret-key' } });
    fireEvent.change(timeoutInput, { target: { value: '4200' } });
    fireEvent.click(enableCheckbox);
    fireEvent.click(within(container).getByRole('button', { name: /保存配置|Save config/i }));

    expect(window.localStorage.getItem(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalEnabled)).toBe('true');
    expect(window.localStorage.getItem(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalEndpoint)).toBe('https://provider.example.dev/analyze');
    expect(window.localStorage.getItem(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalTimeoutMs)).toBe('4200');
    expect(window.localStorage.getItem(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalApiKey)).toBeNull();
    expect(onRefreshAcousticProviderState).toHaveBeenCalledTimes(1);
    expect(within(container).getByText(/配置已保存|config saved/i)).toBeTruthy();
  });

  it('rejects insecure provider endpoint when saving config', () => {
    const onRefreshAcousticProviderState = vi.fn();

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
        onRefreshAcousticProviderState,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    fireEvent.change(within(container).getByLabelText(/外部 endpoint|External endpoint/i), {
      target: { value: 'http://provider.example.dev/analyze' },
    });

    fireEvent.click(within(container).getByRole('button', { name: /保存配置|Save config/i }));

    expect(onRefreshAcousticProviderState).toHaveBeenCalledTimes(0);
    expect(within(container).getByText(/HTTPS/i)).toBeTruthy();
  });

  it('shows disabled provider health status without network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const container = setupProviderHealthPanel();

    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/^已禁用$|^Disabled$/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows unconfigured provider health status when endpoint is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const container = setupProviderHealthPanel();

    enableExternalProviderForHealthCheck(container, { endpoint: '' });
    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/未配置 endpoint|Endpoint missing/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows auth-classified provider health status when endpoint returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    fireEvent.click(within(container).getByLabelText(/启用外部 provider|Enable external provider/i));
    fireEvent.change(within(container).getByLabelText(/外部 endpoint|External endpoint/i), {
      target: { value: 'https://provider.example.dev/analyze' },
    });

    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/鉴权失败|Unauthorized/i)).toBeTruthy();
    expect(await within(container).findByText(/Check API key|请检查 API Key/i)).toBeTruthy();
  });

  it('shows auth-classified provider health status when endpoint returns 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    const container = setupProviderHealthPanel();
    enableExternalProviderForHealthCheck(container);
    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/权限不足|Forbidden/i)).toBeTruthy();
    expect(await within(container).findByText(/Check API key|请检查 API Key/i)).toBeTruthy();
  });

  it('shows timeout provider health status when probe exceeds timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted by timeout', 'AbortError'));
      }, { once: true });
    }));

    const container = setupProviderHealthPanel();
    enableExternalProviderForHealthCheck(container, { timeoutMs: 500 });
    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/^请求超时$|^Timed out$/i, {}, { timeout: 2000 })).toBeTruthy();
    expect(await within(container).findByText(/500ms/i, {}, { timeout: 2000 })).toBeTruthy();
  });

  it('shows network-error provider health status when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });

    const container = setupProviderHealthPanel();
    enableExternalProviderForHealthCheck(container);
    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/网络不可达|Network error/i)).toBeTruthy();
    expect(await within(container).findByText(/Failed to fetch/i)).toBeTruthy();
  });

  it('shows http-error provider health status for non-auth http failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));

    const container = setupProviderHealthPanel();
    enableExternalProviderForHealthCheck(container);
    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/HTTP 异常|HTTP error/i)).toBeTruthy();
    expect(await within(container).findByText(/HTTP 503/i)).toBeTruthy();
  });

  it('shows unknown-error provider health status for non-network exceptions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('provider runtime exploded');
    });

    const container = setupProviderHealthPanel();
    enableExternalProviderForHealthCheck(container);
    fireEvent.click(within(container).getByRole('button', { name: /健康检查|Health check/i }));

    expect(await within(container).findByText(/未知错误|Unknown error/i)).toBeTruthy();
    expect(await within(container).findByText(/provider runtime exploded/i)).toBeTruthy();
  });

  it('supports auto provider preference and maps it to null', () => {
    const onChangeAcousticProvider = vi.fn();

    const { container } = render(
      <AiPanelContext.Provider value={makeContextValue({
        acousticRuntimeStatus: { state: 'ready', phase: 'done', progressRatio: 1 },
        acousticProviderPreference: null,
        onChangeAcousticProvider,
      })}
      >
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} activeTab="acoustic" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const selects = within(container).getAllByRole('combobox') as HTMLSelectElement[];
    const providerSelect = selects.find((node) => node.value === '__auto__');
    expect(providerSelect).toBeTruthy();

    fireEvent.change(providerSelect as HTMLSelectElement, { target: { value: 'enhanced-provider' } });
    expect(onChangeAcousticProvider).toHaveBeenCalledWith('enhanced-provider');

    fireEvent.change(providerSelect as HTMLSelectElement, { target: { value: '__auto__' } });
    expect(onChangeAcousticProvider).toHaveBeenLastCalledWith(null);
  });
});
