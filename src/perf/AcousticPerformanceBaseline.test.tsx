// @vitest-environment jsdom
import { useEffect } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildAcousticInspectorSlice, buildAcousticPanelBatchBuildResult, buildAcousticPanelDetail, serializeAcousticPanelBatchDetailCsv, serializeAcousticPanelBatchDetailJson } from '../utils/acousticPanelDetail';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticFeatureResult } from '../utils/acousticOverlayTypes';
import { useTranscriptionAiAcousticRuntime } from '../pages/useTranscriptionAiAcousticRuntime';

type AcousticPerfProfile = 'local' | 'ci';

function resolveAcousticPerfProfile(): AcousticPerfProfile {
  const value = (process.env.JIEYU_ACOUSTIC_PERF_PROFILE ?? '').trim().toLowerCase();
  return value === 'ci' ? 'ci' : 'local';
}

const ACOUSTIC_PERF_PROFILE = resolveAcousticPerfProfile();

const ACOUSTIC_PERF_BUDGETS: Record<AcousticPerfProfile, {
  hoverMs: number;
  exportCsvMs: number;
  exportJsonMs: number;
}> = {
  local: {
    hoverMs: 420,
    exportCsvMs: 800,
    exportJsonMs: 1400,
  },
  ci: {
    hoverMs: 320,
    exportCsvMs: 650,
    exportJsonMs: 1100,
  },
};

const acousticPerfBudget = ACOUSTIC_PERF_BUDGETS[ACOUSTIC_PERF_PROFILE];

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted[middle] ?? values[0] ?? 0;
}

function runMeasured<T>(runs: number, callback: () => T): { value: T; samplesMs: number[]; medianMs: number } {
  let value: T | null = null;
  const samplesMs = Array.from({ length: runs }, () => {
    const startedAtMs = performance.now();
    value = callback();
    return performance.now() - startedAtMs;
  });
  return {
    value: value as T,
    samplesMs,
    medianMs: computeMedian(samplesMs),
  };
}

const { mockAnalyzeMedia, mockResolveProviderState, mockAcousticService } = vi.hoisted(() => ({
  mockAnalyzeMedia: vi.fn<(...args: unknown[]) => Promise<AcousticFeatureResult>>(),
  mockResolveProviderState: vi.fn<(preferredProviderId?: string | null) => {
    requestedProviderId: string;
    effectiveProviderId: string;
    reachability: { id: string; available: boolean; latencyMs?: number; error?: string };
    fellBackToLocal: boolean;
    fallbackReason?: string;
  }>(),
  mockAcousticService: {
    analyzeMedia: vi.fn<(...args: unknown[]) => Promise<AcousticFeatureResult>>(),
    resolveProviderState: vi.fn<(preferredProviderId?: string | null) => {
      requestedProviderId: string;
      effectiveProviderId: string;
      reachability: { id: string; available: boolean; latencyMs?: number; error?: string };
      fellBackToLocal: boolean;
      fallbackReason?: string;
    }>(),
  },
}));

mockAcousticService.analyzeMedia = mockAnalyzeMedia;
mockAcousticService.resolveProviderState = mockResolveProviderState;

vi.mock('../services/acoustic/AcousticAnalysisService', () => ({
  AcousticAnalysisService: {
    getInstance: () => mockAcousticService,
  },
}));

function makeProviderState() {
  return {
    requestedProviderId: 'local-yin-spectral',
    effectiveProviderId: 'local-yin-spectral',
    reachability: {
      id: 'local-yin-spectral',
      available: true,
      latencyMs: 0,
    },
    fellBackToLocal: false,
  };
}

function makeLargeAnalysis(frameCount: number, frameStepSec: number): AcousticFeatureResult {
  const durationSec = frameCount * frameStepSec;
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const timeSec = Number((index * frameStepSec).toFixed(6));
    return {
      timeSec,
      f0Hz: 110 + ((index * 3) % 220),
      intensityDb: -36 + ((index * 7) % 18),
      reliability: 0.62 + ((index % 8) * 0.04),
      spectralCentroidHz: 900 + ((index * 13) % 1800),
      spectralRolloffHz: 1800 + ((index * 17) % 2800),
      formantF1Hz: 450 + ((index * 5) % 380),
      formantF2Hz: 1200 + ((index * 11) % 1400),
      formantReliability: 0.55 + ((index % 6) * 0.06),
    };
  });

  return {
    mediaKey: 'perf-media',
    sampleRate: 16000,
    durationSec,
    config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    hotspots: [],
    summary: {
      selectionStartSec: 0,
      selectionEndSec: durationSec,
      f0MinHz: 110,
      f0MaxHz: 330,
      f0MeanHz: 220,
      intensityMinDb: -36,
      intensityPeakDb: -18,
      reliabilityMean: 0.76,
      voicedFrameCount: frameCount,
      frameCount,
    },
    frames,
  };
}

describe('Acoustic performance baseline', () => {
  it('keeps inspector hover slicing within budget on long audio', () => {
    const analysis = makeLargeAnalysis(28000, 0.01);
    const detail = buildAcousticPanelDetail(analysis, 0, analysis.durationSec);
    expect(detail).not.toBeNull();
    if (!detail) return;

    const hoverTimes = Array.from({ length: 3200 }, (_, index) => (index / 3200) * analysis.durationSec);

    buildAcousticInspectorSlice(detail, hoverTimes[0]);

    const { value: nullSlices, samplesMs, medianMs } = runMeasured(5, () => {
      let count = 0;
      for (const timeSec of hoverTimes) {
        const slice = buildAcousticInspectorSlice(detail, timeSec);
        if (!slice) {
          count += 1;
        }
      }
      return count;
    });

    expect(nullSlices).toBe(0);
    expect(medianMs).toBeLessThan(acousticPerfBudget.hoverMs);

    // eslint-disable-next-line no-console
    console.info('[Acoustic Perf Baseline][hover]', {
      profile: ACOUSTIC_PERF_PROFILE,
      frameCount: detail.sampleCount,
      hoverCount: hoverTimes.length,
      budgetMs: acousticPerfBudget.hoverMs,
      medianMs: Number(medianMs.toFixed(3)),
      samplesMs: samplesMs.map((value) => Number(value.toFixed(3))),
    });
  });

  it('keeps batch export serialization under budget', () => {
    const analysis = makeLargeAnalysis(36000, 0.008);
    const ranges = Array.from({ length: 60 }, (_, index) => {
      const start = index * 3.2;
      return {
        selectionId: `utt-${index + 1}`,
        selectionLabel: `utt-${index + 1}`,
        selectionStartSec: start,
        selectionEndSec: start + 2.8,
      };
    });

    const batch = buildAcousticPanelBatchBuildResult(analysis, ranges).details;
    expect(batch.length).toBeGreaterThan(40);

    const { value: csv, samplesMs: csvSamplesMs, medianMs: csvMedianMs } = runMeasured(5, () => serializeAcousticPanelBatchDetailCsv(batch));
    const { value: json, samplesMs: jsonSamplesMs, medianMs: jsonMedianMs } = runMeasured(5, () => serializeAcousticPanelBatchDetailJson(batch));

    expect(csv.length).toBeGreaterThan(2000);
    expect(json.length).toBeGreaterThan(2000);
    expect(csvMedianMs).toBeLessThan(acousticPerfBudget.exportCsvMs);
    expect(jsonMedianMs).toBeLessThan(acousticPerfBudget.exportJsonMs);

    // eslint-disable-next-line no-console
    console.info('[Acoustic Perf Baseline][export]', {
      profile: ACOUSTIC_PERF_PROFILE,
      selections: batch.length,
      csvBudgetMs: acousticPerfBudget.exportCsvMs,
      jsonBudgetMs: acousticPerfBudget.exportJsonMs,
      csvMedianMs: Number(csvMedianMs.toFixed(3)),
      jsonMedianMs: Number(jsonMedianMs.toFixed(3)),
      csvSamplesMs: csvSamplesMs.map((value) => Number(value.toFixed(3))),
      jsonSamplesMs: jsonSamplesMs.map((value) => Number(value.toFixed(3))),
      csvBytes: csv.length,
      jsonBytes: json.length,
    });
  });

  it('throttles runtime progress updates under burst traffic', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockResolveProviderState.mockReturnValue(makeProviderState());

    let nowMs = 0;
    let progressEventCount = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    try {
      mockAnalyzeMedia.mockImplementation(async (input: unknown) => {
        const request = input as {
          signal?: AbortSignal;
          onProgress?: (progress: {
            phase: 'analyzing' | 'done';
            ratio: number;
            processedFrames: number;
            totalFrames: number;
          }) => void;
        };

        for (let index = 1; index <= 200; index += 1) {
          if (request.signal?.aborted) break;
          nowMs += 5;
          progressEventCount += 1;
          request.onProgress?.({
            phase: 'analyzing',
            ratio: index / 1000,
            processedFrames: index,
            totalFrames: 1000,
          });
          await Promise.resolve();
        }

        nowMs += 1;
        progressEventCount += 1;
        request.onProgress?.({
          phase: 'done',
          ratio: 1,
          processedFrames: 1000,
          totalFrames: 1000,
        });

        return makeLargeAnalysis(1800, 0.01);
      });

      const seekToTimeRef = { current: vi.fn() };
      const statusHistory: string[] = [];

      const { result } = renderHook((props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => {
        const runtime = useTranscriptionAiAcousticRuntime(props);
        useEffect(() => {
          if (runtime.acousticRuntimeStatus.state === 'loading') {
            const processed = runtime.acousticRuntimeStatus.processedFrames ?? 0;
            statusHistory.push(`loading:${processed}`);
            return;
          }
          statusHistory.push(runtime.acousticRuntimeStatus.state);
        }, [runtime.acousticRuntimeStatus]);
        return runtime;
      }, {
        initialProps: {
          selectedMediaUrl: '/media/perf.wav',
          selectedTimelineMediaId: 'perf-media',
          selectionStartSec: 0,
          selectionEndSec: 4,
          seekToTimeRef,
        },
      });

      await waitFor(() => {
        expect(result.current.acousticRuntimeStatus.state).toBe('ready');
      });

      const loadingUpdates = statusHistory.filter((item) => item.startsWith('loading:')).length;
      expect(progressEventCount).toBe(201);
      expect(loadingUpdates).toBeLessThanOrEqual(35);
      expect(loadingUpdates).toBeGreaterThanOrEqual(1);
      expect(loadingUpdates).toBeLessThan(progressEventCount / 4);

      // eslint-disable-next-line no-console
      console.info('[Acoustic Perf Baseline][progress]', {
        profile: ACOUSTIC_PERF_PROFILE,
        progressEventCount,
        loadingUpdates,
        totalStatusTransitions: statusHistory.length,
        lastState: statusHistory[statusHistory.length - 1],
      });
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});
