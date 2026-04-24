/**
 * VoiceInputService - voice capture and speech recognition.
 *
 * Centralizes microphone permission handling, audio streams, and STT transcription.
 * Supports:
 *   - Web Speech API (browser-native)
 *   - whisper-local (whisper.cpp HTTP service on port 3040)
 *   - commercial (Groq/Gemini and other hosted STT providers)
 *
 * Note: Ollama on port 11434 does not expose an audio transcription API.
 */

import type { Region } from '../utils/regionDetection';
import { createLogger } from '../observability/logger';
import { VadMonitorRuntime } from './VoiceInputService.vad';
import { RecordingExecutor } from './VoiceInputService.recording';
import { WhisperXVadService } from './vad/WhisperXVadService';
import { recommendVadStrategy } from './SttStrategyRouter';
import type { SttEnhancementConfig, SttEnhancementKind, SttEnhancementProvider, SttEnhancementSpeakerTurn, SttEnhancementWordTiming } from './stt/enhancementRegistry';
export {
  testOllamaWhisperAvailability,
  testWhisperServerAvailability,
} from './VoiceInputService.probes';
export type { OllamaWhisperAvailabilityResult } from './VoiceInputService.probes';

const log = createLogger('VoiceInputService');

// ── Types ──

export type SttEngine = 'web-speech' | 'whisper-local' | 'commercial';

export interface SttResult {
  text: string;
  lang: string;
  isFinal: boolean;
  confidence: number;            // 0-1
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
  lang: string;                  // BCP-47, e.g. 'zh-CN'
  continuous: boolean;
  interimResults: boolean;
  preferredEngine: SttEngine;
  /** Detected or selected region. Controls fallback chain order. */
  region?: Region;
  maxAlternatives?: number;      // default 3
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

export interface AecCapability {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

type VoiceInputListener = (result: SttResult) => void;
type VoiceInputErrorListener = (error: string) => void;
type VoiceInputStateListener = (listening: boolean) => void;
type VoiceInputVadListener = (speaking: boolean) => void;
type VoiceInputEnergyListener = (rms: number) => void;

// ── Web Speech API type augmentation ──

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
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

// ── Helpers ──

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== undefined;
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

// ── Service ──

const DEFAULT_CONFIG: VoiceInputConfig = {
  lang: 'zh-CN',
  continuous: true,
  interimResults: true,
  preferredEngine: 'web-speech',
  maxAlternatives: 3,
  vadEnabled: true,
  vadRmsThreshold: 0.018,
  vadSilenceMs: 700,
  vadFrameIntervalMs: 80,
};

/**
 * Manages a SpeechRecognition instance with event-based result delivery.
 *
 * Usage (Web Speech API — continuous):
 *   const svc = new VoiceInputService();
 *   svc.onResult(result => { ... });
 *   svc.start({ lang: 'ja-JP', continuous: true, interimResults: true, preferredEngine: 'web-speech' });
 *   svc.stop();
 *
 * Usage (whisper-local — push-to-talk):
 *   const svc = new VoiceInputService();
 *   svc.onResult(result => { ... });
 *   svc.start({ lang: 'ja-JP', preferredEngine: 'whisper-local', whisperServerUrl: 'http://localhost:3040', whisperServerModel: 'ggml-small-q5_k.bin' });
 *   // Press-and-hold:
 *   svc.startRecording();  // begins MediaRecorder capture
 *   svc.stopRecording();   // stops capture, sends to whisper-server, emits result via onResult
 */
export class VoiceInputService {
  private recognition: SpeechRecognition | null = null;
  private _listening = false;
  private _config: VoiceInputConfig = DEFAULT_CONFIG;
  private _intentionalStop = false;
  private _speaking = false;
  private _disposed = false;
  private _engineSwitchToken = 0;
  private _switchingEngine = false;
  private switchEngineTimer: ReturnType<typeof setTimeout> | null = null;

  // VAD runtime — delegated to VadMonitorRuntime | VAD 运行时委托
  private vadMonitor: VadMonitorRuntime;

  // Recording — delegated to RecordingExecutor | 录音委托
  private recordingExecutor: RecordingExecutor;
  private sharedAnalysisStream: MediaStream | null = null;
  /** WhisperX VAD 服务（按需惰性初始化）| WhisperX VAD service (lazily initialized) */
  private _vadService: WhisperXVadService | null = null;

  // ── Language override (updated from UI without restarting engine) ──────────

  /**
   * Update the language used for the next transcription.
   * Called by useVoiceAgent when the user changes the language selector
   * while the engine is already running.
   */
  setLang(lang: string): void {
    this._config = { ...this._config, lang };
    // Update the running Web Speech recognition language without a restart.
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  setSttEnhancement(
    provider: SttEnhancementProvider | undefined,
    config: SttEnhancementConfig | undefined,
  ): void {
    const nextConfig: VoiceInputConfig = { ...this._config };
    if (provider !== undefined) {
      nextConfig.sttEnhancement = provider;
    } else {
      delete nextConfig.sttEnhancement;
    }
    if (config !== undefined) {
      nextConfig.sttEnhancementConfig = config;
    } else {
      delete nextConfig.sttEnhancementConfig;
    }
    this._config = nextConfig;
  }

  async ensureSharedAnalysisStream(): Promise<MediaStream | null> {
    if (this.sharedAnalysisStream && this.sharedAnalysisStream.active) {
      return this.sharedAnalysisStream;
    }
    if (!navigator.mediaDevices?.getUserMedia) return null;
    this.sharedAnalysisStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return this.sharedAnalysisStream;
  }

  async createAnalysisCloneStream(): Promise<MediaStream | null> {
    const base = await this.ensureSharedAnalysisStream();
    const track = base?.getAudioTracks?.()[0];
    if (!track) return null;
    return new MediaStream([track.clone()]);
  }

  releaseSharedAnalysisStream(): void {
    if (!this.sharedAnalysisStream) return;
    for (const track of this.sharedAnalysisStream.getTracks()) {
      track.stop();
    }
    this.sharedAnalysisStream = null;
  }

  // Listeners
  private resultListeners: VoiceInputListener[] = [];
  private errorListeners: VoiceInputErrorListener[] = [];
  private stateListeners: VoiceInputStateListener[] = [];
  private vadListeners: VoiceInputVadListener[] = [];
  private energyListeners: VoiceInputEnergyListener[] = [];

  constructor() {
    this.vadMonitor = new VadMonitorRuntime({
      createAnalysisCloneStream: () => this.createAnalysisCloneStream(),
      setSpeaking: (v) => this.setSpeaking(v),
      emitEnergyLevel: (rms) => { for (const l of this.energyListeners) l(rms); },
      stop: () => this.stop(),
      isDisposed: () => this._disposed,
      isListening: () => this._listening,
      isIntentionalStop: () => this._intentionalStop,
    });
    this.recordingExecutor = new RecordingExecutor({
      emitResult: (r) => this.emitResult(r),
      emitError: (e) => this.emitError(e),
    });
  }

  /** The currently active STT engine (may differ from preferredEngine after fallback). */
  private _currentEngine: SttEngine = 'web-speech';

  /** Per-engine failure reasons collected during _attemptEngineWithFallback. */
  private _engineFailureReasons: Partial<Record<SttEngine, string>> = {};

  // ── Event subscription ──

  onResult(fn: VoiceInputListener): () => void {
    this.resultListeners.push(fn);
    return () => { this.resultListeners = this.resultListeners.filter((l) => l !== fn); };
  }

  onError(fn: VoiceInputErrorListener): () => void {
    this.errorListeners.push(fn);
    return () => { this.errorListeners = this.errorListeners.filter((l) => l !== fn); };
  }

  onStateChange(fn: VoiceInputStateListener): () => void {
    this.stateListeners.push(fn);
    return () => { this.stateListeners = this.stateListeners.filter((l) => l !== fn); };
  }

  onVadStateChange(fn: VoiceInputVadListener): () => void {
    this.vadListeners.push(fn);
    return () => { this.vadListeners = this.vadListeners.filter((l) => l !== fn); };
  }

  onEnergyLevel(fn: VoiceInputEnergyListener): () => void {
    this.energyListeners.push(fn);
    return () => { this.energyListeners = this.energyListeners.filter((l) => l !== fn); };
  }

  /** Returns the most recent RMS energy level (0–1 normalised). */
  getEnergyLevel(): number {
    return this.vadMonitor.energyLevel;
  }

  get engine(): SttEngine {
    return this._currentEngine;
  }

  /**
   * Ordered fallback chain tried when the preferred engine fails.
   * Order adapts to user region — CN users prefer commercial engines first
   * (Web Speech API / Google is unreliable in mainland China).
   */
  private get fallbackChain(): SttEngine[] {
    if (this._config.region === 'cn') {
      return ['commercial', 'whisper-local', 'web-speech'];
    }
    return ['web-speech', 'whisper-local', 'commercial'];
  }

  // ── Lifecycle ──

  start(config?: Partial<VoiceInputConfig>): void {
    if (this._listening) return;
    this._disposed = false;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._intentionalStop = false;

    this._syncVadForEngine(this._config.preferredEngine);

    void this._attemptEngineWithFallback(this._config.preferredEngine);
  }

  /**
   * Switch to a different STT engine while already listening.
   * Stops the current engine and starts the new one.
   * Optional config can be passed to update settings (e.g., when switching to whisper-local).
   */
  switchEngine(engine: SttEngine, config?: { whisperServerUrl?: string; whisperServerModel?: string }): void {
    log.debug('switchEngine', { engine, config, currentUrl: this._config.whisperServerUrl });
    if (!this._listening) return;
    // Update config if provided (e.g., whisper config when switching to whisper-local)
    if (config) {
      this._config = { ...this._config, ...config };
      log.debug('switchEngine updated whisperServerUrl', { whisperServerUrl: this._config.whisperServerUrl });
    }
    if (this.switchEngineTimer) {
      clearTimeout(this.switchEngineTimer);
      this.switchEngineTimer = null;
    }
    const switchToken = ++this._engineSwitchToken;
    this._switchingEngine = true;
    this._stopCurrentEngine();
    this._currentEngine = engine;
    this.switchEngineTimer = setTimeout(() => {
      this.switchEngineTimer = null;
      if (this._disposed || !this._listening || !this._switchingEngine || switchToken !== this._engineSwitchToken) return;
      this._intentionalStop = false;
      this._attemptEngineWithFallback(engine).catch((err) => {
        log.error('switchEngine error', { err });
      }).finally(() => {
        if (switchToken === this._engineSwitchToken) {
          this._switchingEngine = false;
        }
      });
    }, 300);
  }

  /**
   * Attempt to start an engine, falling back to the next engine in the chain on failure.
   */
  private async _attemptEngineWithFallback(engine: SttEngine): Promise<void> {
    this._engineFailureReasons = {};
    const chain = this.fallbackChain;
    const startIdx = chain.indexOf(engine);
    const enginesToTry = startIdx >= 0 ? chain.slice(startIdx) : chain;

    for (const e of enginesToTry) {
      this._currentEngine = e;
      this._syncVadForEngine(e);
      const started = this._startEngine(e);
      if (started) return;
      // Engine failed — reason was recorded by _startEngine
    }

    // All engines failed — build a detailed message
    const reasons = enginesToTry
      .map((e) => {
        const reason = this._engineFailureReasons[e];
        const label = this._engineLabel(e);
        return reason ? `• ${label}\uff1a${reason}` : `• ${label}`;
      })
      .join('\n');
    this.emitError(`\u6240\u6709 STT \u5f15\u64ce\u5747\u4e0d\u53ef\u7528\uff1a\n${reasons}\n\u8bf7\u68c0\u67e5\u4e0a\u8ff0\u914d\u7f6e\u548c\u7f51\u7edc\u8fde\u63a5\u3002`);
    this.setListening(false);
  }

  private _engineLabel(e: SttEngine): string {
    switch (e) {
      case 'web-speech': return 'Web Speech API';
      case 'whisper-local': return 'Whisper.cpp';
      case 'commercial': return '\u5546\u4e1a STT';
      default: return e;
    }
  }

  private _shouldUseVadForEngine(engine: SttEngine): boolean {
    return recommendVadStrategy({
      preferred: engine,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      ...(this._config.vadEnabled !== undefined && { vadEnabled: this._config.vadEnabled }),
    });
  }

  private _syncVadForEngine(engine: SttEngine): void {
    const useVad = this._shouldUseVadForEngine(engine);
    if (useVad && !this._vadService) {
      const vadService = new WhisperXVadService();
      this._vadService = vadService;
      vadService.init().then(() => {
        if (this._disposed || this._vadService !== vadService) {
          return;
        }
        log.debug('WhisperX VAD initialized');
        this.recordingExecutor.setVadService(this._shouldUseVadForEngine(this._currentEngine) ? vadService : null);
      }).catch((err) => {
        if (this._vadService === vadService) {
          this._vadService = null;
        }
        log.warn('WhisperX VAD init failed, proceeding without VAD', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.recordingExecutor.setVadService(null);
      });
      return;
    }

    if (useVad && this._vadService) {
      this.recordingExecutor.setVadService(this._vadService);
      return;
    }

    this.recordingExecutor.setVadService(null);
  }

  /**
   * Start a specific engine. Returns true if the engine started successfully.
   */
  private _startEngine(engine: SttEngine): boolean {
    switch (engine) {
      case 'web-speech':
        return this._startWebSpeech();
      case 'whisper-local':
        // whisper-local requires push-to-talk; mark as listening so the UI can show it,
        // but the user must press-and-hold to record.
        this._listening = true;
        this.emitState(true);
        return true;
      case 'commercial':
        // commercial requires push-to-talk (it sends a recorded blob);
        // if no commercial provider is configured, treat as unavailable
        if (!this._config.commercialFallback) {
          this._engineFailureReasons['commercial'] = '\u672a\u914d\u7f6e\u5546\u4e1a STT provider';
          return false;
        }
        this._listening = true;
        this.emitState(true);
        return true;
      default:
        return false;
    }
  }

  private _startWebSpeech(): boolean {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this._engineFailureReasons['web-speech'] = '\u6d4f\u89c8\u5668\u4e0d\u652f\u6301 Web Speech API';
      return false;
    }

    const rec = new Ctor();
    rec.lang = this._config.lang;
    rec.continuous = this._config.continuous;
    rec.interimResults = this._config.interimResults;
    rec.maxAlternatives = this._config.maxAlternatives ?? 3;

    rec.onstart = () => {
      this._listening = true;
      this.emitState(true);
      this.vadMonitor.resetSilenceTimer(this._config.maxSilenceMs ?? 30_000);
      void this.vadMonitor.start(this._config);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const primary = result[0];
        if (!primary) continue;

        const alternatives: Array<{ text: string; confidence: number }> = [];
        for (let j = 1; j < result.length; j++) {
          const alt = result[j];
          if (alt) {
            alternatives.push({
              text: alt.transcript,
              confidence: typeof alt.confidence === 'number' && Number.isFinite(alt.confidence) ? alt.confidence : 0,
            });
          }
        }

        const sttResult: SttResult = {
          text: primary.transcript,
          lang: this._config.lang,
          isFinal: result.isFinal,
          confidence: typeof primary.confidence === 'number' && Number.isFinite(primary.confidence) ? primary.confidence : 0,
          engine: 'web-speech',
          ...(alternatives.length > 0 ? { alternatives } : {}),
        };

        this.emitResult(sttResult);
      }
    };

    // Fatal errors trigger fallback; non-fatal are silently ignored
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this._engineFailureReasons['web-speech'] = `Web Speech API \u9519\u8bef: ${event.error}`;
      // Fatal error — attempt fallback to next engine in chain
      const chain = this.fallbackChain;
      const nextIdx = chain.indexOf('web-speech') + 1;
      if (nextIdx < chain.length && chain[nextIdx]) {
        this._stopCurrentEngine();
        void this._attemptEngineWithFallback(chain[nextIdx] as SttEngine);
      } else if (this._config.commercialFallback) {
        // All local engines failed and commercial is configured — notify caller
        this._stopCurrentEngine();
        this.emitError(`Web Speech \u4e0d\u53ef\u7528\uff08${event.error}\uff09\u3002\u8bf7\u5207\u6362\u5230\u5546\u4e1a STT \u5f15\u64ce\uff0c\u6216\u68c0\u67e5 Ollama \u670d\u52a1\u3002`);
      } else {
        this.emitError(`Web Speech \u4e0d\u53ef\u7528\uff08${event.error}\uff09\u3002`);
      }
    };

    rec.onend = () => {
      if (this.recognition !== rec) return;
      if (this._switchingEngine) return;
      if (this._listening && !this._intentionalStop && this._config.continuous) {
        try {
          rec.start();
        } catch (err) {
          log.warn('continuous restart failed', { err });
        }
        return;
      }
      this.setListening(false);
      this.vadMonitor.stop();

    };

    this.recognition = rec;
    try {
      rec.start();
      return true;
    } catch (err) {
      log.warn('rec.start() failed', { err });
      return false;
    }
  }

  private _stopCurrentEngine(): void {
    this._intentionalStop = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (err) { log.debug('recognition.stop() failed during engine stop', { err }); }
      this.recognition = null;
    }
    this.vadMonitor.stop();
    this.recordingExecutor.dispose();
  }

  stop(): void {
    if (this.switchEngineTimer) {
      clearTimeout(this.switchEngineTimer);
      this.switchEngineTimer = null;
    }
    this._engineSwitchToken += 1;
    this._switchingEngine = false;
    this._intentionalStop = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (err) { log.debug('recognition.stop() failed during stop()', { err }); }
    }
    if (this.recordingExecutor.isRecording) {
      void this.stopRecording().catch((error) => {
        this.emitError(error instanceof Error ? error.message : '\u5f55\u97f3\u505c\u6b62\u5931\u8d25');
      });
    }
    this.setListening(false);
    this.vadMonitor.stop();
    this.recognition = null;
    this.releaseSharedAnalysisStream();
  }

  /**
   * Start push-to-talk audio recording (for whisper-local engine).
   * Begins capturing microphone audio via MediaRecorder.
   * Call stopRecording() to stop and trigger transcription.
   */
  async startRecording(): Promise<void> {
    return this.recordingExecutor.startRecording();
  }

  /**
   * Stop push-to-talk recording and transcribe the captured audio via whisper-server.
   * Emits the transcription result via onResult().
   * No-op if not currently recording.
   */
  async stopRecording(): Promise<void> {
    return this.recordingExecutor.stopRecording(this._currentEngine, {
      ...(this._config.whisperServerUrl !== undefined && { whisperServerUrl: this._config.whisperServerUrl }),
      ...(this._config.whisperServerModel !== undefined && { whisperServerModel: this._config.whisperServerModel }),
      lang: this._config.lang,
      ...(this._config.sttEnhancement !== undefined && { sttEnhancement: this._config.sttEnhancement }),
      ...(this._config.sttEnhancementConfig !== undefined && { sttEnhancementConfig: this._config.sttEnhancementConfig }),
      ...(this._config.commercialFallback !== undefined && { commercialFallback: this._config.commercialFallback }),
    });
  }

  dispose(): void {
    this._disposed = true;
    this.stop();
    this.resultListeners = [];
    this.errorListeners = [];
    this.stateListeners = [];
    this.vadListeners = [];
    this.energyListeners = [];
    this.vadMonitor.stopSilenceTimer();
    this.recordingExecutor.dispose();
    this.releaseSharedAnalysisStream();
    if (this._vadService) {
      this._vadService.dispose();
      this._vadService = null;
    }
  }

  // ── Private ──

  private setListening(value: boolean): void {
    if (this._listening !== value) {
      this._listening = value;
      this.emitState(value);
    }
  }

  private emitResult(result: SttResult): void {
    if (this._disposed) return;
    for (const fn of this.resultListeners) fn(result);
  }

  private emitError(error: string): void {
    if (this._disposed) return;
    for (const fn of this.errorListeners) fn(error);
  }

  private emitState(listening: boolean): void {
    if (this._disposed) return;
    for (const fn of this.stateListeners) fn(listening);
  }

  private emitVadState(speaking: boolean): void {
    if (this._disposed) return;
    for (const fn of this.vadListeners) fn(speaking);
  }

  private setSpeaking(value: boolean): void {
    if (this._speaking === value) return;
    this._speaking = value;
    this.emitVadState(value);
  }
}
