import { describe, expect, it } from 'vitest';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { buildTranscriptionAiPromptContext, buildUtteranceTimelineDigest } from './TranscriptionPage.aiPromptContext';
import { buildPromptContextBlock } from '../ai/chat/promptContext';

const MOCK_UTTERANCE_DIGEST_ROWS = [
  { id: 'utt-1', startTime: 0, endTime: 35.1, transcription: 'Hello world' },
  { id: 'utt-2', startTime: 35.1, endTime: 48.4, transcription: 'Second segment' },
  { id: 'utt-3', startTime: 48.4, endTime: 59.9 },
  { id: 'utt-4', startTime: 59.9, endTime: 73.3, transcription: 'Fourth' },
  { id: 'utt-5', startTime: 73.3, endTime: 86.7, transcription: 'Fifth segment text' },
  { id: 'utt-6', startTime: 86.7, endTime: 100.1, transcription: 'Sixth' },
];

const MOCK_CURRENT_MEDIA_UNITS: TimelineUnitView[] = MOCK_UTTERANCE_DIGEST_ROWS.map((u) => ({
  id: u.id,
  kind: 'utterance',
  mediaId: 'media-1',
  layerId: 'layer-1',
  startTime: u.startTime,
  endTime: u.endTime,
  text: u.transcription ?? '',
}));

describe('buildTranscriptionAiPromptContext', () => {
  it('injects acousticSummary into longTerm context without frame arrays', () => {
    const context = buildTranscriptionAiPromptContext({
      selectionSnapshot: {
        activeUnitId: 'utt-1',
        selectedUnit: null,
        selectedRowMeta: null,
        selectedUnitKind: 'utterance',
        selectedUnitStartSec: 1.2,
        selectedUnitEndSec: 3.4,
        selectedLayerId: 'layer-1',
        selectedLayerType: 'transcription',
        selectedTranscriptionLayerId: 'layer-1',
        selectedText: 'test',
        selectedTimeRangeLabel: '1.20-3.40',
        timelineUnit: null,
      },
      selectedUnitIds: ['utt-1'],
      currentMediaUnits: MOCK_CURRENT_MEDIA_UNITS,
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

    expect(context.longTerm).toBeDefined();
    expect(JSON.stringify(context.longTerm)).not.toContain('frames');
    expect(context.shortTerm?.projectUnitCount).toBe(12);
    expect(context.shortTerm?.currentMediaUnitCount).toBe(6);
    expect(context.shortTerm?.unitTimeline).toContain('#1');
    expect(context.shortTerm?.unitTimeline).toContain('Hello world');

    const block = buildPromptContextBlock(context, 4000);
    expect(block).toContain('projectUnitCount=12 [authoritative');
    expect(block).toContain('currentTrack.unitCount=6 [current audio track only');
    expect(block).toContain('unitTimeline=');
    expect(block).toContain('[current audio track digest; #N are line indices, not unit ids]');
    expect(block).toContain('acousticSummary(');
    expect(block).toContain('selectionSec=1.20-3.40');
    expect(block).toContain('f0Mean=195');
    expect(block).toContain('intensityPeak=-12.0dB');
    expect(block).toContain('centroidMean=1180');
    expect(block).toContain('rolloffMean=2520');
    expect(block).toContain('zcrMean=4.8%');
    expect(block).toContain('flatnessMean=0.231');
    expect(block).toContain('loudnessMean=-17.4dB');
    expect(block).toContain('mfcc=12.40/-3.20/1.90');
    expect(block).toContain('formantF1Mean=560');
    expect(block).toContain('formantF2Mean=1760');
    expect(block).toContain('runtime=yin-v2-spectral@16000Hz');
    expect(block).toContain('hotspots=pitch_break@2.10s|intensity_peak@2.80s');
    expect(block).toContain('waveformAnalysis(trackLowConfidence=0, trackOverlaps=0, trackGaps=1, trackMaxGapSec=0.4');
  });

  it('keeps localUnitIndex out of serialized context while exposing world model snapshot', () => {
    const projectUnitsForTools: TimelineUnitView[] = [
      { id: 'u1', kind: 'utterance', mediaId: 'm1', layerId: 'layer-1', startTime: 0, endTime: 2, text: 'alpha', textId: 't1' },
      { id: 'u2', kind: 'utterance', mediaId: 'm1', layerId: 'layer-1', startTime: 2, endTime: 4, text: 'beta' },
    ];
    const context = buildTranscriptionAiPromptContext({
      selectionSnapshot: {
        activeUnitId: 'utt-1',
        selectedUnit: null,
        selectedRowMeta: null,
        selectedUnitKind: 'utterance',
        selectedUnitStartSec: 0,
        selectedUnitEndSec: 1,
        selectedLayerId: 'layer-1',
        selectedLayerType: 'transcription',
        selectedTranscriptionLayerId: 'layer-1',
        selectedText: '',
        selectedTimeRangeLabel: '',
        timelineUnit: null,
      },
      selectedUnitIds: [],
      currentMediaUnits: [],
      projectUnitsForTools,
      utteranceCount: 2,
      translationLayerCount: 0,
      aiConfidenceAvg: null,
      observerStage: null,
      topLexemes: [],
      recommendations: [],
      recentEdits: [],
    });

    expect(context.shortTerm?.localUnitIndex).toHaveLength(2);
    expect(context.shortTerm?.localUnitIndex?.[0]).toMatchObject({
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      text: 'alpha',
    });
    const secondRow = context.shortTerm?.localUnitIndex?.[1] as { text?: string } | undefined;
    expect(secondRow?.text).toBe('beta');

    const block = buildPromptContextBlock(context, 4000);
    expect(block).not.toContain('localUnitIndex');
    expect(block).toContain('worldModelSnapshot=');
    expect(block).toContain('alpha');
  });

  it('renders a stable scope snapshot for project/current-track/selection', () => {
    const context = buildTranscriptionAiPromptContext({
      selectionSnapshot: {
        activeUnitId: 'utt-1',
        selectedUnit: null,
        selectedRowMeta: null,
        selectedUnitKind: 'segment',
        selectedUnitStartSec: 1.2,
        selectedUnitEndSec: 1.9,
        selectedLayerId: 'layer-1',
        selectedLayerType: 'transcription',
        selectedTranscriptionLayerId: 'layer-1',
        selectedText: 'alpha',
        selectedTimeRangeLabel: '00:01.2-00:01.9',
        timelineUnit: { layerId: 'layer-1', unitId: 'seg-1', kind: 'segment' },
      },
      selectedUnitIds: ['seg-1'],
      currentMediaUnits: [],
      utteranceCount: 4,
      translationLayerCount: 1,
      aiConfidenceAvg: 0.912,
      observerStage: null,
      topLexemes: [],
      recommendations: [],
      recentEdits: [],
    });

    const block = buildPromptContextBlock(context, 4000);
    expect(block).toContain('projectUnitCount=4 [authoritative');
    expect(block).toContain('currentTrack.unitCount=0 [current audio track only');
    expect(block).toContain('projectStats(units=4, translationLayers=1, aiConfidenceAvg=0.912)');
  });

  it('keeps scope-critical ShortTerm counters when context block is trimmed', () => {
    const context = buildTranscriptionAiPromptContext({
      selectionSnapshot: {
        activeUnitId: 'utt-1',
        selectedUnit: null,
        selectedRowMeta: null,
        selectedUnitKind: 'utterance',
        selectedUnitStartSec: 0,
        selectedUnitEndSec: 1,
        selectedLayerId: 'layer-1',
        selectedLayerType: 'transcription',
        selectedTranscriptionLayerId: 'layer-1',
        selectedText: 'trim-check',
        selectedTimeRangeLabel: '00:00.0-00:01.0',
        timelineUnit: null,
      },
      selectedUnitIds: ['utt-1'],
      currentMediaUnits: [],
      utteranceCount: 4,
      translationLayerCount: 2,
      aiConfidenceAvg: 0.5,
      observerStage: 'review',
      topLexemes: ['x'.repeat(120)],
      recommendations: ['y'.repeat(220)],
      recentEdits: ['z'.repeat(120)],
    });

    const block = buildPromptContextBlock(context, 420);
    expect(block).toContain('projectUnitCount=4 [authoritative');
    expect(block).toContain('currentTrack.unitCount=0 [current audio track only');
    expect(block).toContain('worldModelSnapshot=');
    expect(block).not.toContain('recommendations=');
  });

  it('withholds empty local unit index while segment-backed data is still loading', () => {
    const context = buildTranscriptionAiPromptContext({
      selectionSnapshot: {
        activeUnitId: null,
        selectedUnit: null,
        selectedRowMeta: null,
        selectedUnitKind: null,
        selectedLayerId: null,
        selectedText: '',
        selectedTimeRangeLabel: '',
        timelineUnit: null,
      },
      selectedUnitIds: [],
      currentMediaUnits: [],
      projectUnitsForTools: [],
      unitIndexComplete: false,
      utteranceCount: 0,
      translationLayerCount: 0,
      aiConfidenceAvg: null,
      observerStage: null,
      topLexemes: [],
      recommendations: [],
      recentEdits: [],
    });

    expect(context.shortTerm?.unitIndexComplete).toBe(false);
    expect(context.shortTerm?.localUnitIndex).toBeUndefined();
    const block = buildPromptContextBlock(context, 4000);
    expect(block).toContain('unitIndexComplete=false');
  });
});

describe('buildUtteranceTimelineDigest', () => {
  it('returns empty string for empty array', () => {
    expect(buildUtteranceTimelineDigest([])).toBe('');
  });

  it('formats utterances with time ranges and truncated text', () => {
    const result = buildUtteranceTimelineDigest(MOCK_UTTERANCE_DIGEST_ROWS);
    expect(result).toContain('#1 00:00.0');
    expect(result).toContain('#3');
    expect(result).toContain('#6');
    expect(result).not.toContain('#7');
  });

  it('omits text for utterances without transcription', () => {
    const result = buildUtteranceTimelineDigest([
      { id: 'a', startTime: 0, endTime: 5 },
    ]);
    expect(result).toContain('#1 00:00.0');
    expect(result).not.toContain('"');
  });

  it('truncates text longer than 30 characters', () => {
    const result = buildUtteranceTimelineDigest([
      { id: 'a', startTime: 0, endTime: 5, transcription: 'A'.repeat(50) },
    ]);
    expect(result).toContain('A'.repeat(30));
    expect(result).toContain('\u2026');
  });
});