import { describe, expect, it, vi } from 'vitest';
import { tryWebSpeechRecognitionStart, wireWebSpeechOnEnd } from './VoiceInputService.webSpeechSession';

describe('VoiceInputService.webSpeechSession', () => {
  it('tryWebSpeechRecognitionStart returns false when start throws', () => {
    const rec = {
      start: () => {
        throw new Error('x');
      },
    } as unknown as import('./VoiceInputService.webSpeechSupport').SpeechRecognition;
    expect(tryWebSpeechRecognitionStart(rec)).toBe(false);
  });

  it('tryWebSpeechRecognitionStart returns true when start succeeds', () => {
    const rec = { start: vi.fn() } as unknown as import('./VoiceInputService.webSpeechSupport').SpeechRecognition;
    expect(tryWebSpeechRecognitionStart(rec)).toBe(true);
  });

  it('wireWebSpeechOnEnd delegates to restart vs end', () => {
    const endListeningSession = vi.fn();
    const restartContinuous = vi.fn();
    const rec = { onend: null as (() => void) | null } as { onend: (() => void) | null };
    wireWebSpeechOnEnd(rec as never, {
      isCurrentRecognition: () => true,
      switchingEngine: () => false,
      shouldRestartContinuous: () => true,
      restartContinuous,
      endListeningSession,
    });
    rec.onend?.();
    expect(restartContinuous).toHaveBeenCalled();
    expect(endListeningSession).not.toHaveBeenCalled();
  });
});
