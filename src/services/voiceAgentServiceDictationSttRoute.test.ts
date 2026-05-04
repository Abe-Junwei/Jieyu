import { describe, expect, it, vi } from 'vitest';
import { tryConsumeSttThroughDictationPipeline, tryRouteFinalSttToDictationPipeline } from './voiceAgentServiceDictationSttRoute';
import type { SttResult } from './VoiceInputService';

function makeFinal(text: string): SttResult {
  return {
    text,
    isFinal: true,
    confidence: 0.9,
  } as SttResult;
}

describe('tryConsumeSttThroughDictationPipeline', () => {
  it('returns false when pipeline is null', () => {
    expect(
      tryConsumeSttThroughDictationPipeline({
        pipeline: null,
        result: { text: 'x', isFinal: false, confidence: 0.5 } as SttResult,
        setDetectedLang: vi.fn(),
        setInterimText: vi.fn(),
        setFinalText: vi.fn(),
        setConfidence: vi.fn(),
      }),
    ).toBe(false);
  });

  it('feeds interim results to the pipeline and returns true', () => {
    const onStt = vi.fn();
    const setInterim = vi.fn();
    const setLang = vi.fn();
    const r = { text: 'partial', isFinal: false, confidence: 0.55, lang: 'zh-CN' } as SttResult;
    expect(
      tryConsumeSttThroughDictationPipeline({
        pipeline: { onSttResult: onStt },
        result: r,
        setDetectedLang: setLang,
        clearErrorOnNonEmptyInterim: vi.fn(),
        setInterimText: setInterim,
        setFinalText: vi.fn(),
        setConfidence: vi.fn(),
      }),
    ).toBe(true);
    expect(setLang).toHaveBeenCalledWith('zh-CN');
    expect(onStt).toHaveBeenCalledWith(r);
    expect(setInterim).toHaveBeenCalledWith('partial');
  });
});

describe('voiceAgentServiceDictationSttRoute', () => {
  it('returns false when pipeline is null', () => {
    const commit = vi.fn();
    expect(
      tryRouteFinalSttToDictationPipeline({
        pipeline: null,
        result: makeFinal('hi'),
        commitFinalTranscript: commit,
        recordDictationQuality: vi.fn(),
        scheduleEngineCheck: vi.fn(),
      }),
    ).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns false when result is not final', () => {
    const onStt = vi.fn();
    expect(
      tryRouteFinalSttToDictationPipeline({
        pipeline: { onSttResult: onStt },
        result: { text: 'x', isFinal: false, confidence: 0.5 } as SttResult,
        commitFinalTranscript: vi.fn(),
        recordDictationQuality: vi.fn(),
        scheduleEngineCheck: vi.fn(),
      }),
    ).toBe(false);
    expect(onStt).not.toHaveBeenCalled();
  });

  it('commits, feeds pipeline, records quality, schedules check, then returns true', () => {
    const onStt = vi.fn();
    const commit = vi.fn();
    const record = vi.fn();
    const schedule = vi.fn();
    const r = makeFinal('dictated');

    expect(
      tryRouteFinalSttToDictationPipeline({
        pipeline: { onSttResult: onStt },
        result: r,
        commitFinalTranscript: commit,
        recordDictationQuality: record,
        scheduleEngineCheck: schedule,
      }),
    ).toBe(true);

    expect(commit).toHaveBeenCalledWith('dictated', 0.9);
    expect(onStt).toHaveBeenCalledWith(r);
    expect(record).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
