// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { UtteranceDocType } from '../db';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import {
  AiPanelContext,
  DEFAULT_AI_PANEL_CONTEXT_VALUE,
  type AiPanelContextValue,
} from '../contexts/AiPanelContext';
import {
  EmbeddingProvider,
  DEFAULT_EMBEDDING_CONTEXT_VALUE,
  type EmbeddingContextValue,
} from '../contexts/EmbeddingContext';
import { pickEmbeddingContextValue } from '../hooks/useEmbeddingContextValue';

function makeUtterance(overrides: Partial<UtteranceDocType> = {}): UtteranceDocType {
  return {
    id: 'utt-1',
    mediaId: 'media-1',
    startTime: 1,
    endTime: 2,
    transcription: { default: 'hello world' },
    words: [],
    ...overrides,
  } as unknown as UtteranceDocType;
}

function makeContextValue(overrides: Partial<AiPanelContextValue> = {}): AiPanelContextValue {
  return {
    ...DEFAULT_AI_PANEL_CONTEXT_VALUE,
    dbName: 'jieyudb',
    utteranceCount: 1,
    translationLayerCount: 1,
    selectedUtterance: makeUtterance(),
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
  it('invokes similarity search callback from embedding card', () => {
    const onFindSimilarUtterances = vi.fn().mockResolvedValue(undefined);
    const baseContext = makeContextValue();
    const embeddingContext = makeEmbeddingContextValue({
      selectedUtterance: baseContext.selectedUtterance,
      onFindSimilarUtterances,
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

    expect(onFindSimilarUtterances).toHaveBeenCalledTimes(1);
  });

  it('invokes jump callback and highlights active similarity match', () => {
    const onJumpToEmbeddingMatch = vi.fn();
    const baseContext = makeContextValue({
      selectedUtterance: makeUtterance({ id: 'utt-2' }),
    });
    const embeddingContext = makeEmbeddingContextValue({
      selectedUtterance: makeUtterance({ id: 'utt-2' }),
      aiEmbeddingMatches: [
        {
          utteranceId: 'utt-2',
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

  it('renders dedicated acoustic tab content and supports jumping to hotspots', () => {
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
            { timeSec: 2.0, relativeTimeSec: 0.8, timeRatio: 0.36, f0Hz: 212, intensityDb: -16.8, reliability: 0.66, spectralCentroidHz: 980, spectralRolloffHz: 2120, zeroCrossingRate: 0.036, formantF1Hz: 490, formantF2Hz: 1500, formantReliability: 0.52, normalizedF0: 0.18, normalizedIntensity: 0.22 },
            { timeSec: 2.04, relativeTimeSec: 0.84, timeRatio: 0.38, f0Hz: 225, intensityDb: -14.6, reliability: 0.7, spectralCentroidHz: 1120, spectralRolloffHz: 2320, zeroCrossingRate: 0.042, formantF1Hz: 520, formantF2Hz: 1640, formantReliability: 0.58, normalizedF0: 0.34, normalizedIntensity: 0.48 },
            { timeSec: 2.08, relativeTimeSec: 0.88, timeRatio: 0.4, f0Hz: 241, intensityDb: -13.2, reliability: 0.76, spectralCentroidHz: 1264, spectralRolloffHz: 2710, zeroCrossingRate: 0.052, formantF1Hz: 560, formantF2Hz: 1760, formantReliability: 0.62, normalizedF0: 0.54, normalizedIntensity: 0.64 },
            { timeSec: 2.12, relativeTimeSec: 0.92, timeRatio: 0.42, f0Hz: 256, intensityDb: -12.6, reliability: 0.81, spectralCentroidHz: 1310, spectralRolloffHz: 2830, zeroCrossingRate: 0.056, formantF1Hz: 590, formantF2Hz: 1860, formantReliability: 0.66, normalizedF0: 0.72, normalizedIntensity: 0.76 },
            { timeSec: 2.16, relativeTimeSec: 0.96, timeRatio: 0.44, f0Hz: 272, intensityDb: -12.1, reliability: 0.86, spectralCentroidHz: 1360, spectralRolloffHz: 2920, zeroCrossingRate: 0.06, formantF1Hz: 640, formantF2Hz: 1940, formantReliability: 0.7, normalizedF0: 0.92, normalizedIntensity: 0.88 },
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
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });
});
