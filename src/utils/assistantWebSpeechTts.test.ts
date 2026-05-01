// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  isAssistantWebSpeechTtsSupported,
  plainTextForAssistantTts,
  speakAssistantReplyWithWebSpeechTts,
  stopAssistantWebSpeechTts,
} from './assistantWebSpeechTts';

describe('plainTextForAssistantTts', () => {
  it('removes fenced code and collapses whitespace', () => {
    const input = 'Hello\n\n```js\nconst x = 1;\n```\nWorld';
    expect(plainTextForAssistantTts(input)).toBe('Hello World');
  });

  it('unwraps markdown links and inline code', () => {
    const input = 'See `npm` and [docs](https://x.com) now';
    expect(plainTextForAssistantTts(input)).toBe('See npm and docs now');
  });

  it('strips light markdown emphasis', () => {
    expect(plainTextForAssistantTts('**bold** and *italic*')).toBe('bold and italic');
  });
});

describe('speechSynthesis wiring', () => {
  it('isAssistantWebSpeechTtsSupported is false when speechSynthesis is missing', () => {
    const orig = window.speechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    expect(isAssistantWebSpeechTtsSupported()).toBe(false);
    Object.defineProperty(window, 'speechSynthesis', { value: orig, configurable: true });
  });

  it('speakAssistantReplyWithWebSpeechTts cancels then speaks with lang', () => {
    const origUtterance = globalThis.SpeechSynthesisUtterance;
    globalThis.SpeechSynthesisUtterance = class MockUtterance {
      text: string;
      lang = '';
      voice: SpeechSynthesisVoice | null = null;
      constructor(text = '') {
        this.text = text;
      }
    } as unknown as typeof SpeechSynthesisUtterance;
    const cancel = vi.fn();
    const speak = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const getVoices = vi.fn(() => [{ lang: 'en-US', name: 'A', voiceURI: 'a', default: true, localService: false }]);
    const origSyn = window.speechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel, speak, addEventListener, removeEventListener, getVoices },
      configurable: true,
    });

    speakAssistantReplyWithWebSpeechTts('Hello **world**', 'en-US');

    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0]![0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('Hello world');
    expect(utterance.lang).toBe('en-US');

    Object.defineProperty(window, 'speechSynthesis', { value: origSyn, configurable: true });
    globalThis.SpeechSynthesisUtterance = origUtterance;
  });

  it('stopAssistantWebSpeechTts cancels synthesis', () => {
    const cancel = vi.fn();
    const orig = window.speechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', { value: { cancel }, configurable: true });
    stopAssistantWebSpeechTts();
    expect(cancel).toHaveBeenCalled();
    Object.defineProperty(window, 'speechSynthesis', { value: orig, configurable: true });
  });
});
