/**
 * Web Speech recognition instance wiring helpers (Phase C2 split).
 */

import { createLogger } from '../observability/logger';
import { getSpeechRecognitionCtor } from './VoiceInputService.webSpeechSupport';
import type { SpeechRecognition } from './VoiceInputService.webSpeechSupport';

const log = createLogger('VoiceInputService.webSpeechSession');

export const WEB_SPEECH_NOT_SUPPORTED_REASON = '\u6d4f\u89c8\u5668\u4e0d\u652f\u6301 Web Speech API';

export function instantiateWebSpeechRecognition(): SpeechRecognition | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  return new Ctor();
}

export function applyWebSpeechRecognizerOptions(
  rec: SpeechRecognition,
  opts: {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
  },
): void {
  rec.lang = opts.lang;
  rec.continuous = opts.continuous;
  rec.interimResults = opts.interimResults;
  rec.maxAlternatives = opts.maxAlternatives;
}

export function tryWebSpeechRecognitionStart(rec: SpeechRecognition): boolean {
  try {
    rec.start();
    return true;
  } catch (err) {
    log.warn('rec.start() failed', { err });
    return false;
  }
}

/**
 * Continuous mode: restart after engine end, or stop listening + VAD when session ends.
 */
export function wireWebSpeechOnEnd(
  rec: SpeechRecognition,
  ctx: {
    isCurrentRecognition: () => boolean;
    switchingEngine: () => boolean;
    shouldRestartContinuous: () => boolean;
    restartContinuous: () => void;
    endListeningSession: () => void;
  },
): void {
  rec.onend = () => {
    if (!ctx.isCurrentRecognition()) return;
    if (ctx.switchingEngine()) return;
    if (ctx.shouldRestartContinuous()) {
      ctx.restartContinuous();
      return;
    }
    ctx.endListeningSession();
  };
}
