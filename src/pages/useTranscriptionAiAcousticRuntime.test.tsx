// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticFeatureResult } from '../utils/acousticOverlayTypes';
import { useTranscriptionAiAcousticRuntime } from './useTranscriptionAiAcousticRuntime';

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

function makeAnalysisResult(): AcousticFeatureResult {
  return {
    mediaKey: 'media-1',
    sampleRate: 16000,
    durationSec: 1.2,
    config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    hotspots: [
      {
        kind: 'pitch_peak',
        timeSec: 0.5,
        startSec: 0.45,
        endSec: 0.55,
        score: 0.72,
        f0Hz: 182,
        intensityDb: -14,
        reliability: 0.88,
      },
    ],
    summary: {
      selectionStartSec: 0,
      selectionEndSec: 1.2,
      f0MinHz: 120,
      f0MaxHz: 220,
      f0MeanHz: 176,
      intensityMinDb: -26,
      intensityPeakDb: -12,
      reliabilityMean: 0.81,
      voicedFrameCount: 3,
      frameCount: 3,
    },
    frames: [
      { timeSec: 0.2, f0Hz: 142, intensityDb: -24, reliability: 0.72, spectralCentroidHz: 1520, spectralRolloffHz: 2820, formantF1Hz: 520, formantF2Hz: 1720 },
      { timeSec: 0.5, f0Hz: 182, intensityDb: -14, reliability: 0.88, spectralCentroidHz: 1810, spectralRolloffHz: 3210, formantF1Hz: 600, formantF2Hz: 1910 },
      { timeSec: 0.9, f0Hz: 205, intensityDb: -12, reliability: 0.84, spectralCentroidHz: 1960, spectralRolloffHz: 3380, formantF1Hz: 640, formantF2Hz: 2050 },
    ],
  };
}

function makeAnalysisResultForMedia(mediaKey: string): AcousticFeatureResult {
  return {
    ...makeAnalysisResult(),
    mediaKey,
  };
}

function makeCalibratedAnalysisResult(): AcousticFeatureResult {
  const frames = Array.from({ length: 30 }, (_, index) => {
    const timeSec = Number((index * 0.1).toFixed(2));
    return {
      timeSec,
      f0Hz: 160 + index,
      intensityDb: -20 + (index * 0.1),
      reliability: 0.82,
      formantF1Hz: 520 + (index * 2),
      formantF2Hz: 1700 + (index * 3),
      formantReliability: 0.68,
    };
  });

  return {
    mediaKey: 'media-calibrated',
    sampleRate: 16000,
    durationSec: 3,
    config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    hotspots: [
      {
        kind: 'pitch_peak',
        timeSec: 1.2,
        startSec: 1.1,
        endSec: 1.3,
        score: 0.8,
        f0Hz: 185,
        intensityDb: -16,
        reliability: 0.84,
      },
    ],
    summary: {
      selectionStartSec: 0,
      selectionEndSec: 3,
      f0MinHz: 160,
      f0MaxHz: 189,
      f0MeanHz: 174.5,
      intensityMinDb: -20,
      intensityPeakDb: -17.1,
      reliabilityMean: 0.82,
      voicedFrameCount: 30,
      frameCount: 30,
    },
    frames,
  };
}

describe('useTranscriptionAiAcousticRuntime', () => {
  it('recovers from error after retry and restores summary/detail state', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockResolveProviderState.mockReturnValue(makeProviderState());
    mockAnalyzeMedia
      .mockRejectedValueOnce(new Error('analysis failed once'))
      .mockImplementation(async () => makeAnalysisResult());

    const seekTo = vi.fn();
    const seekToTimeRef = { current: seekTo };

    const initialProps: Parameters<typeof useTranscriptionAiAcousticRuntime>[0] = {
      selectedMediaUrl: '/media/demo.wav',
      selectedTimelineMediaId: 'media-1',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
      providerPreference: 'local-yin-spectral',
    };

    const { result, rerender } = renderHook((props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => useTranscriptionAiAcousticRuntime(props), {
      initialProps,
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('error');
    });

    expect(result.current.acousticSummary).toBeNull();
    expect(result.current.acousticDetail).toBeNull();

    rerender({
      selectedMediaUrl: '/media/demo.wav',
      selectedTimelineMediaId: 'media-1',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
      providerPreference: 'local-yin-spectral',
      configOverride: { yinThreshold: 0.2 },
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('loading');
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
      expect(result.current.acousticSummary).not.toBeNull();
      expect(result.current.acousticDetail).not.toBeNull();
    });

    expect(mockAnalyzeMedia.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastRetryCall = mockAnalyzeMedia.mock.calls[mockAnalyzeMedia.mock.calls.length - 1]?.[0];
    expect(lastRetryCall).toEqual(expect.objectContaining({
      mediaKey: 'media-1',
      mediaUrl: '/media/demo.wav',
      config: { yinThreshold: 0.2 },
      providerId: 'local-yin-spectral',
    }));

    result.current.handleJumpToAcousticHotspot(0.5);
    expect(seekTo).toHaveBeenCalledWith(0.5);
  });

  it('re-analyzes and reports fallback provider state when provider preference switches', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockResolveProviderState.mockImplementation((preferredProviderId?: string | null) => {
      if (preferredProviderId === 'enhanced-provider') {
        return {
          requestedProviderId: 'enhanced-provider',
          effectiveProviderId: 'local-yin-spectral',
          reachability: {
            id: 'enhanced-provider',
            available: false,
            error: 'Provider is not configured in this workspace.',
          },
          fellBackToLocal: true,
          fallbackReason: 'Provider is not configured in this workspace.',
        };
      }
      return makeProviderState();
    });
    mockAnalyzeMedia.mockImplementation(async () => makeAnalysisResult());

    const seekToTimeRef = { current: vi.fn() };
    const { result, rerender } = renderHook((props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => useTranscriptionAiAcousticRuntime(props), {
      initialProps: {
        selectedMediaUrl: '/media/demo.wav',
        selectedTimelineMediaId: 'media-1',
        selectionStartSec: 0,
        selectionEndSec: 1,
        seekToTimeRef,
        providerPreference: 'local-yin-spectral',
      },
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
    });

    rerender({
      selectedMediaUrl: '/media/demo.wav',
      selectedTimelineMediaId: 'media-1',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
      providerPreference: 'enhanced-provider',
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('loading');
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
      expect(result.current.acousticProviderState.requestedProviderId).toBe('enhanced-provider');
      expect(result.current.acousticProviderState.effectiveProviderId).toBe('local-yin-spectral');
      expect(result.current.acousticProviderState.fellBackToLocal).toBe(true);
    });

    expect(mockAnalyzeMedia.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastProviderSwitchCall = mockAnalyzeMedia.mock.calls[mockAnalyzeMedia.mock.calls.length - 1]?.[0];
    expect(lastProviderSwitchCall).toEqual(expect.objectContaining({
      providerId: 'enhanced-provider',
    }));
  });

  it('resets to idle when media is detached and recovers when media is re-attached', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockResolveProviderState.mockReturnValue(makeProviderState());
    mockAnalyzeMedia.mockImplementation(async () => makeAnalysisResult());

    const seekToTimeRef = { current: vi.fn() };
    const initialAttachProps: Parameters<typeof useTranscriptionAiAcousticRuntime>[0] = {
      selectedMediaUrl: '/media/demo.wav',
      selectedTimelineMediaId: 'media-1',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
    };

    const { result, rerender } = renderHook((props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => useTranscriptionAiAcousticRuntime(props), {
      initialProps: initialAttachProps,
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
      expect(result.current.acousticSummary).not.toBeNull();
      expect(result.current.acousticDetail).not.toBeNull();
    });

    const detachedProps: Parameters<typeof useTranscriptionAiAcousticRuntime>[0] = {
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
    };
    rerender(detachedProps);

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('idle');
      expect(result.current.acousticSummary).toBeNull();
      expect(result.current.acousticDetail).toBeNull();
      expect(result.current.acousticDetailFullMedia).toBeNull();
    });

    const reattachedProps: Parameters<typeof useTranscriptionAiAcousticRuntime>[0] = {
      selectedMediaUrl: '/media/demo.wav',
      selectedTimelineMediaId: 'media-1',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
    };
    rerender(reattachedProps);

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
      expect(result.current.acousticSummary).not.toBeNull();
      expect(result.current.acousticDetail).not.toBeNull();
    });

    expect(mockAnalyzeMedia.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps only the latest result when provider/config/media change rapidly', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockResolveProviderState.mockImplementation((preferredProviderId?: string | null) => {
      if (preferredProviderId === 'enhanced-provider') {
        return {
          requestedProviderId: 'enhanced-provider',
          effectiveProviderId: 'local-yin-spectral',
          reachability: {
            id: 'enhanced-provider',
            available: false,
            error: 'Provider is not configured in this workspace.',
          },
          fellBackToLocal: true,
          fallbackReason: 'Provider is not configured in this workspace.',
        };
      }
      return makeProviderState();
    });

    type PendingCall = {
      input: { mediaKey: string; mediaUrl: string; providerId?: string; config?: { yinThreshold?: number } };
      resolve: (value: AcousticFeatureResult) => void;
      reject: (reason?: unknown) => void;
    };
    const pendingCalls: PendingCall[] = [];
    mockAnalyzeMedia.mockImplementation((input: unknown) => new Promise<AcousticFeatureResult>((resolve, reject) => {
      pendingCalls.push({
        input: input as PendingCall['input'],
        resolve,
        reject,
      });
    }));

    const seekToTimeRef = { current: vi.fn() };
    const { result, rerender } = renderHook((props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => useTranscriptionAiAcousticRuntime(props), {
      initialProps: {
        selectedMediaUrl: '/media/a.wav',
        selectedTimelineMediaId: 'media-1',
        selectionStartSec: 0,
        selectionEndSec: 1,
        seekToTimeRef,
        providerPreference: 'local-yin-spectral',
        configOverride: { yinThreshold: 0.15 },
      },
    });

    await waitFor(() => {
      expect(pendingCalls.length).toBeGreaterThanOrEqual(1);
      expect(result.current.acousticRuntimeStatus.state).toBe('loading');
    });

    rerender({
      selectedMediaUrl: '/media/a.wav',
      selectedTimelineMediaId: 'media-1',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
      providerPreference: 'enhanced-provider',
      configOverride: { yinThreshold: 0.2 },
    });

    await waitFor(() => {
      expect(pendingCalls.length).toBeGreaterThanOrEqual(2);
    });

    rerender({
      selectedMediaUrl: '/media/final.wav',
      selectedTimelineMediaId: 'media-2',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
      providerPreference: 'local-yin-spectral',
      configOverride: { yinThreshold: 0.25 },
    });

    await waitFor(() => {
      expect(pendingCalls.length).toBeGreaterThanOrEqual(3);
    });

    const latestCall = pendingCalls[pendingCalls.length - 1];
    expect(latestCall).toBeTruthy();
    if (!latestCall) return;
    latestCall.resolve(makeAnalysisResultForMedia('media-2'));

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
      expect(result.current.acousticDetail?.mediaKey).toBe('media-2');
      expect(result.current.acousticProviderState.requestedProviderId).toBe('local-yin-spectral');
      expect(result.current.acousticProviderState.fellBackToLocal).toBe(false);
    });

    pendingCalls[0]?.resolve(makeAnalysisResultForMedia('media-1'));
    pendingCalls[1]?.reject(new Error('intermediate request failed'));

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
      expect(result.current.acousticDetail?.mediaKey).toBe('media-2');
    });

    const lastCallInput = mockAnalyzeMedia.mock.calls[mockAnalyzeMedia.mock.calls.length - 1]?.[0] as PendingCall['input'] | undefined;
    expect(lastCallInput).toEqual(expect.objectContaining({
      mediaKey: 'media-2',
      mediaUrl: '/media/final.wav',
      providerId: 'local-yin-spectral',
      config: { yinThreshold: 0.25 },
    }));
  });

  it('derives calibration status from full-media detail instead of narrow selection', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockResolveProviderState.mockReturnValue(makeProviderState());
    mockAnalyzeMedia.mockImplementation(async () => makeCalibratedAnalysisResult());

    const seekToTimeRef = { current: vi.fn() };
    const { result } = renderHook((props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => useTranscriptionAiAcousticRuntime(props), {
      initialProps: {
        selectedMediaUrl: '/media/calibrated.wav',
        selectedTimelineMediaId: 'media-calibrated',
        selectionStartSec: 0,
        selectionEndSec: 0.2,
        seekToTimeRef,
      },
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
    });

    expect(result.current.acousticDetail?.sampleCount).toBeLessThan(24);
    expect(result.current.acousticDetailFullMedia?.sampleCount).toBeGreaterThanOrEqual(24);
    expect(result.current.acousticCalibrationStatus).toBe('calibrated');
  });

  it('builds batch details for selected utterance ranges on current media', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockResolveProviderState.mockReturnValue(makeProviderState());
    mockAnalyzeMedia.mockImplementation(async () => makeAnalysisResult());

    const seekToTimeRef = { current: vi.fn() };
    const { result } = renderHook((props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => useTranscriptionAiAcousticRuntime(props), {
      initialProps: {
        selectedMediaUrl: '/media/demo.wav',
        selectedTimelineMediaId: 'media-1',
        selectionStartSec: 0,
        selectionEndSec: 1,
        batchSelectionRanges: [
          { selectionId: 'utt-1', selectionLabel: 'utt-1', selectionStartSec: 0.1, selectionEndSec: 0.55 },
          { selectionId: 'utt-2', selectionLabel: 'utt-2', selectionStartSec: 0.45, selectionEndSec: 1.05 },
          { selectionId: 'utt-empty', selectionLabel: 'utt-empty', selectionStartSec: 8, selectionEndSec: 8.5 },
        ],
        seekToTimeRef,
      },
    });

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
    });

    expect(result.current.acousticBatchDetails).toHaveLength(2);
    expect(result.current.acousticBatchDetails[0]).toEqual(expect.objectContaining({
      selectionId: 'utt-1',
      selectionLabel: 'utt-1',
    }));
    expect(result.current.acousticBatchDetails[1]).toEqual(expect.objectContaining({
      selectionId: 'utt-2',
      selectionLabel: 'utt-2',
    }));
    expect(result.current.acousticBatchDetails.every((item) => item.detail.sampleCount > 0)).toBe(true);
    expect(result.current.acousticBatchSelectionCount).toBe(3);
    expect(result.current.acousticBatchDroppedSelectionRanges).toEqual([
      expect.objectContaining({ selectionId: 'utt-empty' }),
    ]);
  });

  it('refreshes provider state on rerender even without analyze-effect dependency changes', async () => {
    mockAnalyzeMedia.mockReset();
    mockResolveProviderState.mockReset();
    mockAnalyzeMedia.mockImplementation(async () => makeAnalysisResult());

    let providerConfigured = false;
    mockResolveProviderState.mockImplementation(() => {
      if (!providerConfigured) {
        return {
          requestedProviderId: 'enhanced-provider',
          effectiveProviderId: 'local-yin-spectral',
          reachability: {
            id: 'enhanced-provider',
            available: false,
            error: 'Provider is not configured in this workspace.',
          },
          fellBackToLocal: true,
          fallbackReason: 'Provider is not configured in this workspace.',
        };
      }

      return {
        requestedProviderId: 'enhanced-provider',
        effectiveProviderId: 'enhanced-provider',
        reachability: {
          id: 'enhanced-provider',
          available: true,
          latencyMs: 42,
        },
        fellBackToLocal: false,
      };
    });

    const seekToTimeRef = { current: vi.fn() };
    const props: Parameters<typeof useTranscriptionAiAcousticRuntime>[0] = {
      selectedMediaUrl: '/media/demo.wav',
      selectedTimelineMediaId: 'media-1',
      selectionStartSec: 0,
      selectionEndSec: 1,
      seekToTimeRef,
      providerPreference: 'enhanced-provider',
    };

    const { result, rerender } = renderHook(
      (hookProps: Parameters<typeof useTranscriptionAiAcousticRuntime>[0]) => useTranscriptionAiAcousticRuntime(hookProps),
      { initialProps: props },
    );

    await waitFor(() => {
      expect(result.current.acousticRuntimeStatus.state).toBe('ready');
    });

    expect(result.current.acousticProviderState.fellBackToLocal).toBe(true);
    expect(result.current.acousticProviderState.effectiveProviderId).toBe('local-yin-spectral');

    providerConfigured = true;
    rerender(props);

    await waitFor(() => {
      expect(result.current.acousticProviderState.fellBackToLocal).toBe(false);
      expect(result.current.acousticProviderState.effectiveProviderId).toBe('enhanced-provider');
    });
  });
});
