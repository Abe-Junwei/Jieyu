/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSpeechRecognitionCtor, isWebSpeechSupported } from './VoiceInputService.webSpeechSupport';

type WindowWithSpeech = Window & {
  /** Test doubles; real runtime uses full SpeechRecognition interface. */
  SpeechRecognition?: new () => unknown;
  webkitSpeechRecognition?: new () => unknown;
};

describe('VoiceInputService.webSpeechSupport', () => {
  const w = window as WindowWithSpeech;
  let origSpeech: WindowWithSpeech['SpeechRecognition'];
  let origWebkit: WindowWithSpeech['webkitSpeechRecognition'];

  beforeEach(() => {
    origSpeech = w.SpeechRecognition;
    origWebkit = w.webkitSpeechRecognition;
  });

  afterEach(() => {
    if (origSpeech !== undefined) w.SpeechRecognition = origSpeech;
    else delete w.SpeechRecognition;
    if (origWebkit !== undefined) w.webkitSpeechRecognition = origWebkit;
    else delete w.webkitSpeechRecognition;
  });

  it('getSpeechRecognitionCtor prefers SpeechRecognition over webkit prefix', () => {
    class A extends EventTarget {}
    class B extends EventTarget {}
    w.SpeechRecognition = A as unknown as NonNullable<typeof w.SpeechRecognition>;
    w.webkitSpeechRecognition = B as unknown as NonNullable<typeof w.webkitSpeechRecognition>;
    expect(getSpeechRecognitionCtor()).toBe(A);
    expect(isWebSpeechSupported()).toBe(true);
  });

  it('getSpeechRecognitionCtor falls back to webkitSpeechRecognition', () => {
    delete w.SpeechRecognition;
    class W extends EventTarget {}
    w.webkitSpeechRecognition = W as unknown as NonNullable<typeof w.webkitSpeechRecognition>;
    expect(getSpeechRecognitionCtor()).toBe(W);
    expect(isWebSpeechSupported()).toBe(true);
  });

  it('isWebSpeechSupported is false when neither ctor exists', () => {
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
    expect(getSpeechRecognitionCtor()).toBeUndefined();
    expect(isWebSpeechSupported()).toBe(false);
  });
});
