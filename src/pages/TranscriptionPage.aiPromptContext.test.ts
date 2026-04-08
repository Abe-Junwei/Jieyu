import { describe, expect, it } from 'vitest';
import { buildTranscriptionAiPromptContext } from './TranscriptionPage.aiPromptContext';
import { buildPromptContextBlock } from '../ai/chat/promptContext';

describe('buildTranscriptionAiPromptContext', () => {
  it('injects acousticSummary into longTerm context without frame arrays', () => {
    const context = buildTranscriptionAiPromptContext({
      selectionSnapshot: {
        activeUtteranceUnitId: 'utt-1',
        selectedUnitKind: 'utterance',
        selectedUnitStartSec: 1.2,
        selectedUnitEndSec: 3.4,
        selectedLayerId: 'layer-1',
        selectedLayerType: 'transcription',
        selectedTranslationLayerId: undefined,
        selectedTranscriptionLayerId: 'layer-1',
        selectedText: 'test',
        selectedTimeRangeLabel: '1.20-3.40',
        timelineUnit: null,
      },
      selectedUnitIds: ['utt-1'],
      utteranceCount: 12,
      translationLayerCount: 2,
      aiConfidenceAvg: 0.91,
      waveformAnalysis: {
        lowConfidenceCount: 0,
        overlapCount: 0,
        gapCount: 1,
        maxGapSeconds: 0.4,
        activeSignals: ['gap'],
      },
      acousticSummary: {
        selectionStartSec: 1.2,
        selectionEndSec: 3.4,
        f0MinHz: 120,
        f0MaxHz: 280,
        f0MeanHz: 195,
        intensityPeakDb: -12,
        reliabilityMean: 0.82,
        voicedFrameCount: 18,
        frameCount: 22,
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
        hotspots: [
          { kind: 'pitch_break', timeSec: 2.1, score: 0.76 },
          { kind: 'intensity_peak', timeSec: 2.8, score: 0.63 },
        ],
      },
      observerStage: 'review',
      topLexemes: ['foo'],
      recommendations: ['bar'],
      audioTimeSec: 2.1,
      recentEdits: ['edit-1'],
    });

    expect(context.longTerm.acousticSummary).toBeDefined();
    expect(JSON.stringify(context.longTerm)).not.toContain('frames');

    const block = buildPromptContextBlock(context, 4000);
    expect(block).toContain('acousticSummary(');
    expect(block).toContain('selectionSec=1.20-3.40');
    expect(block).toContain('f0Mean=195');
    expect(block).toContain('intensityPeak=-12.0dB');
    expect(block).toContain('centroidMean=1180');
    expect(block).toContain('rolloffMean=2520');
    expect(block).toContain('zcrMean=4.8%');
    expect(block).toContain('formantF1Mean=560');
    expect(block).toContain('formantF2Mean=1760');
    expect(block).toContain('runtime=yin-v2-spectral@16000Hz');
    expect(block).toContain('hotspots=pitch_break@2.10s|intensity_peak@2.80s');
  });
});