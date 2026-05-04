/**
 * Web Speech API typings, ctor resolution, and lightweight media helpers.
 * Split from VoiceInputService (Phase C2) to keep the main service file focused on orchestration.
 */

import { createLogger } from '../observability/logger';

const log = createLogger('VoiceInputService.webSpeech');

// ── Web Speech API type augmentation ──

export interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

export interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== undefined;
}

export interface AecCapability {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/**
 * AEC capability diagnostic — checks if browser supports hardware echo cancellation.
 * Auto-releases the microphone track after detection.
 */
export async function runAecDiagnostic(): Promise<AecCapability> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const track = stream.getAudioTracks()[0];
    if (!track) {
      return { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    }
    const settings = track.getSettings();
    track.stop();
    return {
      echoCancellation: settings.echoCancellation === true,
      noiseSuppression: settings.noiseSuppression === true,
      autoGainControl: settings.autoGainControl === true,
    };
  } catch (err) {
    log.warn('detectInputCapabilities failed, using defaults', { err });
    return { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  }
}
