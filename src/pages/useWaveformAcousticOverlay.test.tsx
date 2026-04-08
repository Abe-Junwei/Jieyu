// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticFeatureResult } from '../utils/acousticOverlayTypes';
import { useWaveformAcousticOverlay } from './useWaveformAcousticOverlay';

const { mockAnalyzeMedia } = vi.hoisted(() => ({
  mockAnalyzeMedia: vi.fn<(...args: unknown[]) => Promise<AcousticFeatureResult>>(),
}));

vi.mock('../services/acoustic/AcousticAnalysisService', () => ({
  AcousticAnalysisService: {
    getInstance: () => ({
      analyzeMedia: mockAnalyzeMedia,
    }),
  },
}));

function makeAnalysisResult(): AcousticFeatureResult {
  return {
    mediaKey: 'media-1',
    sampleRate: 16000,
    durationSec: 2,
    config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    hotspots: [],
    summary: {
      selectionStartSec: 0,
      selectionEndSec: 2,
      f0MinHz: 120,
      f0MaxHz: 220,
      f0MeanHz: 170,
      intensityMinDb: -28,
      intensityPeakDb: -12,
      reliabilityMean: 0.8,
      voicedFrameCount: 3,
      frameCount: 3,
    },
    frames: [
      { timeSec: 0.4, f0Hz: 140, intensityDb: -24, reliability: 0.72 },
      { timeSec: 0.8, f0Hz: 168, intensityDb: -18, reliability: 0.81 },
      { timeSec: 1.2, f0Hz: 196, intensityDb: -12, reliability: 0.89 },
    ],
  };
}

describe('useWaveformAcousticOverlay', () => {
  it('builds an F0 path when acoustic overlay mode is f0', async () => {
    mockAnalyzeMedia.mockReset();
    mockAnalyzeMedia.mockResolvedValue(makeAnalysisResult());

    const { result } = renderHook(() => useWaveformAcousticOverlay({
      selectedMediaUrl: '/media/demo.wav',
      mediaId: 'media-1',
      acousticOverlayMode: 'f0',
      waveformDisplayMode: 'waveform',
      containerWidth: 240,
      waveformScrollLeft: 0,
      zoomPxPerSec: 100,
      hoverTime: null,
      playerDuration: 2,
      seekTo: vi.fn(),
    }));

    await waitFor(() => {
      expect(result.current.acousticOverlayLoading).toBe(false);
      expect(result.current.acousticOverlayF0Path).toContain('M');
    });

    expect(mockAnalyzeMedia).toHaveBeenCalledWith(expect.objectContaining({ mediaKey: 'media-1', mediaUrl: '/media/demo.wav' }));
    expect(mockAnalyzeMedia.mock.calls[0]?.[0]).toHaveProperty('signal');
    expect(result.current.acousticOverlayIntensityPath).toBeNull();
    expect(result.current.acousticOverlayVisibleSummary).toEqual({
      f0MeanHz: 168,
      intensityPeakDb: -12,
      voicedFrameCount: 3,
      frameCount: 3,
    });
  });
});