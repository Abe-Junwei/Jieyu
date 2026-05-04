import { describe, expect, it } from 'vitest';
import type { SpeechRecognitionEvent } from './VoiceInputService.webSpeechSupport';
import {
  isIgnorableWebSpeechError,
  resolveWebSpeechFatalError,
  sttResultsFromWebSpeechEvent,
} from './VoiceInputService.webSpeechEngine';

function makeEvent(partial: Partial<SpeechRecognitionEvent> & { results: SpeechRecognitionEvent['results'] }): SpeechRecognitionEvent {
  return {
    type: 'result',
    resultIndex: 0,
    ...partial,
  } as SpeechRecognitionEvent;
}

describe('VoiceInputService.webSpeechEngine', () => {
  it('isIgnorableWebSpeechError', () => {
    expect(isIgnorableWebSpeechError('no-speech')).toBe(true);
    expect(isIgnorableWebSpeechError('aborted')).toBe(true);
    expect(isIgnorableWebSpeechError('network')).toBe(false);
  });

  it('sttResultsFromWebSpeechEvent maps primary + alternatives', () => {
    const event = makeEvent({
      resultIndex: 0,
      results: {
        length: 1,
        item: (i: number) => event.results[i]!,
        0: {
          length: 2,
          isFinal: true,
          item: (i: number) => event.results[0]![i]!,
          0: { transcript: 'hello', confidence: 0.9 },
          1: { transcript: 'hallo', confidence: 0.1 },
        },
      },
    });

    const rows = sttResultsFromWebSpeechEvent(event, 'en-US');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe('hello');
    expect(rows[0]?.engine).toBe('web-speech');
    expect(rows[0]?.alternatives?.[0]?.text).toBe('hallo');
  });

  it('resolveWebSpeechFatalError falls back when chain has a next engine', () => {
    const r = resolveWebSpeechFatalError({
      error: 'network',
      chain: ['web-speech', 'whisper-local'],
      commercialConfigured: false,
    });
    expect(r?.kind).toBe('fallback-next');
    if (r?.kind === 'fallback-next') expect(r.nextEngine).toBe('whisper-local');
  });

  it('resolveWebSpeechFatalError emits commercial hint when configured and no fallback left', () => {
    const r = resolveWebSpeechFatalError({
      error: 'bad',
      chain: ['web-speech'],
      commercialConfigured: true,
    });
    expect(r?.kind).toBe('user-message');
    if (r?.kind === 'user-message') {
      expect(r.stopEngineBeforeEmit).toBe(true);
      expect(r.message).toContain('商业');
    }
  });

  it('resolveWebSpeechFatalError plain path does not request stop', () => {
    const r = resolveWebSpeechFatalError({
      error: 'bad',
      chain: ['web-speech'],
      commercialConfigured: false,
    });
    expect(r?.kind).toBe('user-message');
    if (r?.kind === 'user-message') {
      expect(r.stopEngineBeforeEmit).toBe(false);
    }
  });

  it('resolveWebSpeechFatalError returns null for ignorable codes', () => {
    expect(
      resolveWebSpeechFatalError({
        error: 'no-speech',
        chain: ['web-speech', 'commercial'],
        commercialConfigured: true,
      }),
    ).toBeNull();
  });
});
