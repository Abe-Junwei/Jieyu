import { describe, expect, it, vi } from 'vitest';
import { SpeechAnnotationPipeline, type DictationPipelineCallbacks, type DictationSegment } from './SpeechAnnotationPipeline';
import type { SttResult } from './VoiceInputService';

function makeSegment(overrides: Partial<DictationSegment> = {}): DictationSegment {
  return {
    segmentId: 'seg-1',
    index: 0,
    startTime: 0,
    endTime: 1,
    existingText: null,
    existingTranslation: null,
    existingGloss: null,
    ...overrides,
  };
}

function makeSttResult(text: string): SttResult {
  return {
    text,
    lang: 'zh-CN',
    isFinal: true,
    confidence: 0.9,
    engine: 'web-speech',
  };
}

function makeCallbacks(overrides: Partial<DictationPipelineCallbacks> = {}): DictationPipelineCallbacks {
  return {
    getSegments: () => [makeSegment()],
    getCurrentSegmentId: () => 'seg-1',
    fillSegment: vi.fn(async () => undefined),
    restoreSegment: vi.fn(async () => undefined),
    navigateTo: vi.fn(),
    navigateToNextUnannotated: vi.fn(() => null),
    ...overrides,
  };
}

describe('SpeechAnnotationPipeline', () => {
  it('starts on the first non-skipped unannotated segment', async () => {
    const navigateTo = vi.fn();
    const pipeline = new SpeechAnnotationPipeline(makeCallbacks({
      getSegments: () => [
        makeSegment({ segmentId: 'seg-skip', index: 0, skipProcessing: true }),
        makeSegment({ segmentId: 'seg-2', index: 1 }),
      ],
      getCurrentSegmentId: () => 'seg-skip',
      navigateTo,
    }), {
      targetLayer: 'transcription',
      autoAdvance: false,
      silenceConfirmDelayMs: 0,
      skipAlreadyAnnotated: true,
    });

    await pipeline.start();

    expect(navigateTo).toHaveBeenCalledWith('seg-2');
    expect(pipeline.state.currentSegment?.segmentId).toBe('seg-2');
    expect(pipeline.state.progress.total).toBe(1);
  });

  it('transforms text before filling the target segment', async () => {
    const fillSegment = vi.fn(async () => undefined);
    const transformTextForFill = vi.fn(async ({ text }: { text: string }) => `xf:${text}`);
    const pipeline = new SpeechAnnotationPipeline(makeCallbacks({
      fillSegment,
      transformTextForFill,
    }), {
      targetLayer: 'translation',
      autoAdvance: false,
      silenceConfirmDelayMs: 0,
    });

    await pipeline.start();
    pipeline.onSttResult(makeSttResult('translated text'));
    await vi.waitFor(() => {
      expect(transformTextForFill).toHaveBeenCalledWith({
        layer: 'translation',
        text: 'translated text',
        segmentId: 'seg-1',
      });
      expect(fillSegment).toHaveBeenCalledWith('seg-1', 'translation', 'xf:translated text');
      expect(pipeline.state.confirmedText).toBe('xf:translated text');
    });
  });

  it('falls back to raw text when no transform callback is provided', async () => {
    const fillSegment = vi.fn(async () => undefined);
    const pipeline = new SpeechAnnotationPipeline(makeCallbacks({ fillSegment }), {
      targetLayer: 'transcription',
      autoAdvance: false,
      silenceConfirmDelayMs: 0,
    });

    await pipeline.start();
    pipeline.onSttResult(makeSttResult('plain text'));
    await vi.waitFor(() => {
      expect(fillSegment).toHaveBeenCalledWith('seg-1', 'transcription', 'plain text');
      expect(pipeline.state.confirmedText).toBe('plain text');
    });
  });
});