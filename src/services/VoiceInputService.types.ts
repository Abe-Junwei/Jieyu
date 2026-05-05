import type { Region } from '../utils/regionDetection';

export type SttEngine = 'web-speech' | 'whisper-local' | 'commercial';
export type SttEnhancementKind = 'whisperx-align' | 'mfa-align' | 'pyannote-diarize';

export interface SttEnhancementConfig {
  endpointUrl?: string;
  model?: string;
  language?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface SttEnhancementWordTiming {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SttEnhancementSpeakerTurn {
  speaker: string;
  start: number;
  end: number;
}

export interface SttEnhancementInput {
  transcriptText: string;
  lang: string;
  audioBlob?: Blob;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface SttEnhancementOutput {
  wordTimings?: SttEnhancementWordTiming[];
  speakerTurns?: SttEnhancementSpeakerTurn[];
  debug?: Record<string, unknown>;
}

export interface SttEnhancementProvider {
  readonly kind: SttEnhancementKind;
  isAvailable(config: SttEnhancementConfig): Promise<boolean>;
  enhance(input: SttEnhancementInput, config: SttEnhancementConfig): Promise<SttEnhancementOutput>;
}

export interface SttResult {
  text: string;
  lang: string;
  isFinal: boolean;
  confidence: number;
  engine: SttEngine;
  audioBlob?: Blob;
  wordTimings?: SttEnhancementWordTiming[];
  speakerTurns?: SttEnhancementSpeakerTurn[];
  enhancement?: {
    kind: SttEnhancementKind;
    applied: boolean;
    error?: string;
    wordTimingCount?: number;
    speakerTurnCount?: number;
  };
  alternatives?: Array<{
    text: string;
    confidence: number;
  }>;
}

export interface VoiceInputConfig {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  preferredEngine: SttEngine;
  /** Detected or selected region. Controls fallback chain order. */
  region?: Region;
  maxAlternatives?: number;
  vadEnabled?: boolean;
  vadRmsThreshold?: number;
  vadSilenceMs?: number;
  vadFrameIntervalMs?: number;
  /** Auto-stop after this many ms of continuous silence (VAD-triggered). Default: 30000. */
  maxSilenceMs?: number;
  /** Whisper-server URL for whisper-local engine (OpenAI-compatible), e.g. 'http://localhost:3040' */
  whisperServerUrl?: string;
  /** Whisper-server model name, e.g. 'ggml-small-q5_k.bin' */
  whisperServerModel?: string;
  /** Optional alignment/diarization enhancement that runs after STT returns text. */
  sttEnhancement?: SttEnhancementProvider;
  /** Configuration passed to the selected STT enhancement provider. */
  sttEnhancementConfig?: SttEnhancementConfig;
  /**
   * Pluggable commercial STT provider.
   * Tried automatically when all local engines (Web Speech + Whisper Local) fail.
   * Supports any provider implementing the isAvailable() / transcribe() interface.
   */
  commercialFallback?: CommercialSttProvider;
}

/**
 * Pluggable interface for commercial online STT providers.
 *
 * Implement this interface to add support for any cloud STT service
 * (Gemini, OpenAI Audio, Groq, Deepgram, etc.).
 *
 * All methods must be pure functions — no internal state.
 */
export interface CommercialSttProvider {
  /** Human-readable label shown in the UI engine selector. */
  readonly label: string;
  /** Check whether the service is reachable (health ping / auth check). */
  isAvailable(): Promise<boolean>;
  /** Transcribe an audio blob to text. */
  transcribe(audioBlob: Blob, lang: string, options?: { signal?: AbortSignal }): Promise<SttResult>;
}

/** Built-in commercial provider kinds for UI display. */
export type CommercialProviderKind = 'gemini' | 'openai-audio' | 'groq' | 'custom-http' | 'minimax' | 'volcengine';

export type SttProviderCapability = 'browser-native' | 'local-http' | 'cloud-api';
export type SttBillingKind = 'free' | 'metered' | 'self-hosted';
