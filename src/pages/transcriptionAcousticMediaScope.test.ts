import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
  type AcousticFeatureResult,
} from '../utils/acousticOverlayTypes';
import type { AcousticPromptSummary } from './transcriptionAcousticSummary';
import {
  acousticPromptSummaryField,
  resolveCurrentAcousticMediaKey,
  selectReadyAcousticAnalysis,
  summarizeVisibleAnalysis,
} from './transcriptionAcousticMediaScope';

function makeAnalysis(mediaKey: string): AcousticFeatureResult {
  return {
    mediaKey,
    sampleRate: 16000,
    durationSec: 1,
    config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    hotspots: [],
    summary: {
      selectionStartSec: 0,
      selectionEndSec: 1,
      f0MinHz: 100,
      f0MaxHz: 200,
      f0MeanHz: 150,
      intensityMinDb: -20,
      intensityPeakDb: -10,
      reliabilityMean: 0.8,
      voicedFrameCount: 1,
      frameCount: 1,
    },
    frames: [],
  };
}

function makeSummary(sourceMediaKey?: string): AcousticPromptSummary {
  return {
    selectionStartSec: 0,
    selectionEndSec: 1,
    f0MinHz: 120,
    f0MaxHz: 180,
    f0MeanHz: 150,
    intensityPeakDb: -12,
    reliabilityMean: 0.8,
    voicedFrameCount: 2,
    frameCount: 3,
    ...(sourceMediaKey !== undefined ? { sourceMediaKey } : {}),
  };
}

describe('transcriptionAcousticMediaScope', () => {
  it('keys analysis by the timeline media id, otherwise the media URL', () => {
    expect(resolveCurrentAcousticMediaKey('/media/a.wav', 'media-a')).toBe('media-a');
    expect(resolveCurrentAcousticMediaKey('/media/a.wav', undefined)).toBe('/media/a.wav');
    expect(resolveCurrentAcousticMediaKey(undefined, 'media-a')).toBeNull();
    expect(resolveCurrentAcousticMediaKey('', 'media-a')).toBeNull();
  });

  it('returns analysis only when it is ready and belongs to the current media', () => {
    const analysis = makeAnalysis('media-a');
    expect(selectReadyAcousticAnalysis(analysis, { state: 'ready' }, 'media-a')).toBe(analysis);
    expect(selectReadyAcousticAnalysis(analysis, { state: 'loading' }, 'media-a')).toBeNull();
    expect(selectReadyAcousticAnalysis(analysis, { state: 'ready' }, 'media-b')).toBeNull();
    expect(selectReadyAcousticAnalysis(analysis, { state: 'error' }, 'media-a')).toBeNull();
    expect(selectReadyAcousticAnalysis(null, { state: 'ready' }, 'media-a')).toBeNull();
    expect(selectReadyAcousticAnalysis(analysis, { state: 'ready' }, null)).toBeNull();
  });

  it('tags a visible summary with its media key and returns nothing without analysis', () => {
    expect(summarizeVisibleAnalysis(null, 0, 1)).toBeNull();
    const summary = summarizeVisibleAnalysis(makeAnalysis('media-a'), 0, 1);
    expect(summary).toBeNull();
    const withFrames = makeAnalysis('media-a');
    withFrames.frames = [{ timeSec: 0.2, f0Hz: 140, intensityDb: -20, reliability: 0.8 }];
    expect(summarizeVisibleAnalysis(withFrames, 0, 1)?.sourceMediaKey).toBe('media-a');
  });

  it('omits a summary tagged for another timeline media and strips the media key', () => {
    expect(acousticPromptSummaryField(null, 'media-b')).toEqual({});
    expect(acousticPromptSummaryField(makeSummary('media-a'), 'media-b')).toEqual({});
    expect(acousticPromptSummaryField(makeSummary('media-b'), 'media-b')).toEqual({
      acousticSummary: makeSummary(),
    });
    expect(acousticPromptSummaryField(makeSummary('/media/b.wav'), undefined)).toEqual({
      acousticSummary: makeSummary(),
    });
    expect(acousticPromptSummaryField(makeSummary(), 'media-b').acousticSummary?.f0MeanHz).toBe(
      150,
    );
  });
});
