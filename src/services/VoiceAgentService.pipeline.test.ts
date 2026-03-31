// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { VoiceAgentService } from './VoiceAgentService';
import type { DictationPipelineCallbacks, DictationSegment } from './SpeechAnnotationPipeline';
import type { SttResult } from './VoiceInputService';

vi.mock('./VoiceSessionStore', () => ({
  saveVoiceSession: vi.fn(async () => undefined),
  loadRecentVoiceSessions: vi.fn(async () => []),
}));

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

function makeResult(text: string): SttResult {
  return {
    text,
    lang: 'zh-CN',
    isFinal: true,
    confidence: 0.91,
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('VoiceAgentService dictation pipeline', () => {
  it('injects the default transform hook into SpeechAnnotationPipeline fills', async () => {
    const fillSegment = vi.fn(async () => undefined);
    const transformTextForFill = vi.fn(async ({ text }: { text: string }) => `xf:${text}`);
    const service = new VoiceAgentService({
      onTransformDictationPipelineFill: transformTextForFill,
    });

    service.startDictationPipeline(makeCallbacks({ fillSegment }), {
      targetLayer: 'translation',
      autoAdvance: false,
      silenceConfirmDelayMs: 0,
    });
    service.feedDictationSttResult(makeResult('translated text'));

    await vi.waitFor(() => {
      expect(transformTextForFill).toHaveBeenCalledWith({
        layer: 'translation',
        text: 'translated text',
        segmentId: 'seg-1',
      });
      expect(fillSegment).toHaveBeenCalledWith('seg-1', 'translation', 'xf:translated text');
    });

    service.dispose();
  });

  it('prefers the per-call transform hook when callbacks already provide one', async () => {
    const fillSegment = vi.fn(async () => undefined);
    const serviceTransform = vi.fn(async ({ text }: { text: string }) => `service:${text}`);
    const callbackTransform = vi.fn(async ({ text }: { text: string }) => `callback:${text}`);
    const service = new VoiceAgentService({
      onTransformDictationPipelineFill: serviceTransform,
    });

    service.startDictationPipeline(makeCallbacks({
      fillSegment,
      transformTextForFill: callbackTransform,
    }), {
      targetLayer: 'translation',
      autoAdvance: false,
      silenceConfirmDelayMs: 0,
    });
    service.feedDictationSttResult(makeResult('translated text'));

    await vi.waitFor(() => {
      expect(callbackTransform).toHaveBeenCalledWith({
        layer: 'translation',
        text: 'translated text',
        segmentId: 'seg-1',
      });
      expect(serviceTransform).not.toHaveBeenCalled();
      expect(fillSegment).toHaveBeenCalledWith('seg-1', 'translation', 'callback:translated text');
    });

    service.dispose();
  });
});