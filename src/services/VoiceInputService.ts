/**
 * VoiceInputService — 语音采集与识别
 *
 * 统一管理麦克风权限、音频流、STT 转写。
 * 支持:
 *   - Web Speech API (浏览器内置)
 *   - whisper-local (whisper.cpp HTTP 服务, 端口 3040)
 *   - commercial (Groq/Gemini 等商业 STT)
 *
 * 注意: Ollama (端口 11434) 不支持音频转写 API.
 *
 * @see 解语-语音智能体架构设计方案 §4.1
 */

import type { Region } from '../utils/regionDetection';

// ── Types ──

export type SttEngine = 'web-speech' | 'whisper-local' | 'commercial';

export interface SttResult {
  text: string;
  lang: string;
  isFinal: boolean;
  confidence: number;            // 0-1
  engine: SttEngine;
  audioBlob?: Blob;
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
  transcribe(audioBlob: Blob, lang: string): Promise<SttResult>;
}

export interface OllamaWhisperAvailabilityResult {
  available: boolean;
  error?: string;
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

function buildOllamaTranscriptionEndpoints(baseUrl: string): string[] {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const withoutV1 = normalizedBaseUrl.replace(/\/v1$/, '');

  return Array.from(new Set([
    `${normalizedBaseUrl}/v1/audio/transcriptions`,
    `${withoutV1}/v1/audio/transcriptions`,
    `${normalizedBaseUrl}/api/audio/transcriptions`,
    `${withoutV1}/api/audio/transcriptions`,
  ]));
}

export async function testOllamaWhisperAvailability(
  baseUrl: string,
  model: string,
): Promise<OllamaWhisperAvailabilityResult> {
  const normalizedBaseUrl = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const normalizedModel = model.trim();
  if (!normalizedModel) {
    return { available: false, error: '请先填写本地 Whisper 模型名' };
  }

  const tagsUrl = `${normalizedBaseUrl.replace(/\/v1$/, '')}/api/tags`;
  let availableModels: string[] = [];
  try {
    const resp = await fetch(tagsUrl);
    if (!resp.ok) {
      return { available: false, error: `无法连接 Ollama 服务：${resp.status}` };
    }
    const json = await resp.json() as { models?: Array<{ name?: string; model?: string }> };
    availableModels = (json.models ?? [])
      .map((item) => item.name ?? item.model ?? '')
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, error: `无法连接 Ollama 服务：${message}` };
  }

  if (availableModels.length > 0 && !availableModels.includes(normalizedModel)) {
    const preview = availableModels.slice(0, 3).join('、');
    return {
      available: false,
      error: `未找到模型 ${normalizedModel}。当前可用模型：${preview || '无'}`,
    };
  }

  const endpoints = buildOllamaTranscriptionEndpoints(normalizedBaseUrl);
  for (const endpoint of endpoints) {
    const body = new FormData();
    body.append('file', new Blob(['probe'], { type: 'audio/webm' }), 'probe.webm');
    body.append('model', normalizedModel);
    body.append('language', 'en');

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        body,
      });
      if (resp.status !== 404) {
        return { available: true };
      }
    } catch (err) {
      console.debug('[VoiceInputService] Ollama probe failed, trying next endpoint:', { endpoint, err });
    }
  }

  return {
    available: false,
    error: '当前 Ollama 实例未暴露音频转写接口，请改用支持音频转写的本地服务或其他 STT 引擎',
  };
}

/**
 * Check if a whisper-server (OpenAI-compatible local transcription server) is available.
 * Probes the /v1/models health endpoint and the /v1/audio/transcriptions endpoint.
 */
export async function testWhisperServerAvailability(
  baseUrl: string,
  model: string,
): Promise<{ available: boolean; error?: string }> {
  const normalizedBaseUrl = (baseUrl || 'http://localhost:3040').replace(/\/+$/, '');
  const normalizedModel = model.trim();
  if (!normalizedModel) {
    return { available: false, error: '请先填写 Whisper 模型名' };
  }

  // Probe the health endpoint
  try {
    const healthResp = await fetch(`${normalizedBaseUrl}/v1/models`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!healthResp.ok) {
      return { available: false, error: `whisper-server 不可用：${healthResp.status}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: `无法连接 whisper-server（${normalizedBaseUrl}）：${msg}` };
  }

  // Probe the transcription endpoint with a valid minimal WAV header
  // (whisper-server rejects empty/tiny blobs with 500, so use a real minimal WAV)
  try {
    // Minimal valid WAV: 16-bit mono 8kHz PCM, 0.01 seconds of silence
    // WAV header (44 bytes) + 2 bytes of silence = 46 bytes total
    const minWav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x2E, 0x00, 0x00, 0x00, // "RIFF" + size
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20, // "WAVEfmt "
      0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, // PCM, mono
      0x40, 0x1F, 0x00, 0x00, 0x80, 0x3E, 0x00, 0x00, // 8000Hz, 16000 bytes/sec
      0x02, 0x00, 0x10, 0x00,                         // block align, bits/sample
      0x64, 0x61, 0x74, 0x61, 0x22, 0x00, 0x00, 0x00, // "data" + size
      0x00, 0x00, 0x00, 0x00,                         // 2 bytes of silence
    ]);
    const formData = new FormData();
    formData.append('file', new Blob([minWav], { type: 'audio/wav' }), 'probe.wav');
    formData.append('model', normalizedModel);
    formData.append('language', 'en');
    const resp = await fetch(`${normalizedBaseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000),
    });
    // Any non-404 means the endpoint accepts audio (server is up)
    if (resp.status !== 404) {
      return { available: true };
    }
    return { available: false, error: `whisper-server 未暴露音频转写接口` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: `whisper-server 转写探测失败：${msg}` };
  }
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
      echoCancellation: settings.echoCancellation ?? false,
      noiseSuppression: settings.noiseSuppression ?? false,
      autoGainControl: settings.autoGainControl ?? false,
    };
  } catch (err) {
    console.warn('[VoiceInputService] detectInputCapabilities failed, using defaults:', err);
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

  // VAD runtime
  private vadStream: MediaStream | null = null;
  private vadAudioContext: AudioContext | null = null;
  private vadAnalyser: AnalyserNode | null = null;
  private vadSource: MediaStreamAudioSourceNode | null = null;
  private vadTimerId: number | null = null;
  private vadLastSpeechTs = 0;

  // Silence timeout (auto-stop after prolonged silence)
  private silenceTimerId: number | null = null;
  private lastSpeechTimestamp = 0;

  // Energy level for UI visualization (RMS, updated every VAD frame)
  private _energyLevel = 0;

  // Push-to-talk MediaRecorder (for whisper-local)
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private sharedAnalysisStream: MediaStream | null = null;

  // ── Language override (updated from UI without restarting engine) ──────────

  /**
   * Update the language used for the next transcription.
   * Called by useVoiceAgent when the user changes the language selector
   * while the engine is already running.
   */
  setLang(lang: string): void {
    this._config = { ...this._config, lang };
    // 实时更新 Web Speech API 的 lang | Update running Web Speech recognition lang
    if (this.recognition) {
      this.recognition.lang = lang;
    }
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
  private recordedChunks: Blob[] = [];
  private _isRecording = false;
  /** Guard against concurrent stopRecording calls | 防止并发 stopRecording 竞态 */
  private _stopRecordingPromise: Promise<void> | null = null;

  // Listeners
  private resultListeners: VoiceInputListener[] = [];
  private errorListeners: VoiceInputErrorListener[] = [];
  private stateListeners: VoiceInputStateListener[] = [];
  private vadListeners: VoiceInputVadListener[] = [];
  private energyListeners: VoiceInputEnergyListener[] = [];

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
    return this._energyLevel;
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
    void this._attemptEngineWithFallback(this._config.preferredEngine);
  }

  /**
   * Switch to a different STT engine while already listening.
   * Stops the current engine and starts the new one.
   * Optional config can be passed to update settings (e.g., when switching to whisper-local).
   */
  switchEngine(engine: SttEngine, config?: { whisperServerUrl?: string; whisperServerModel?: string }): void {
    console.debug('[VoiceInputService] switchEngine:', engine, { config, currentUrl: this._config.whisperServerUrl });
    if (!this._listening) return;
    // Update config if provided (e.g., whisper config when switching to whisper-local)
    if (config) {
      this._config = { ...this._config, ...config };
      console.debug('[VoiceInputService] switchEngine: updated whisperServerUrl=', this._config.whisperServerUrl);
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
        console.error('[VoiceInput] switchEngine error:', err);
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
      const started = this._startEngine(e);
      if (started) return;
      // Engine failed — reason was recorded by _startEngine
    }

    // All engines failed — build a detailed message
    const reasons = enginesToTry
      .map((e) => {
        const reason = this._engineFailureReasons[e];
        const label = this._engineLabel(e);
        return reason ? `• ${label}：${reason}` : `• ${label}`;
      })
      .join('\n');
    this.emitError(`所有 STT 引擎均不可用：\n${reasons}\n请检查上述配置和网络连接。`);
    this.setListening(false);
  }

  private _engineLabel(e: SttEngine): string {
    switch (e) {
      case 'web-speech': return 'Web Speech API';
      case 'whisper-local': return 'Whisper.cpp';
      case 'commercial': return '商业 STT';
      default: return e;
    }
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
          this._engineFailureReasons['commercial'] = '未配置商业 STT provider';
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
      this._engineFailureReasons['web-speech'] = '浏览器不支持 Web Speech API';
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
      this.resetSilenceTimer();
      void this.startVadMonitor();
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
      this._engineFailureReasons['web-speech'] = `Web Speech API 错误: ${event.error}`;
      // Fatal error — attempt fallback to next engine in chain
      const chain = this.fallbackChain;
      const nextIdx = chain.indexOf('web-speech') + 1;
      if (nextIdx < chain.length && chain[nextIdx]) {
        this._stopCurrentEngine();
        void this._attemptEngineWithFallback(chain[nextIdx] as SttEngine);
      } else if (this._config.commercialFallback) {
        // All local engines failed and commercial is configured — notify caller
        this._stopCurrentEngine();
        this.emitError(`Web Speech 不可用（${event.error}）。请切换到商业 STT 引擎，或检查 Ollama 服务。`);
      } else {
        this.emitError(`Web Speech 不可用（${event.error}）。`);
      }
    };

    rec.onend = () => {
      if (this.recognition !== rec) return;
      if (this._switchingEngine) return;
      if (this._listening && !this._intentionalStop && this._config.continuous) {
        try {
          rec.start();
        } catch (err) {
          console.warn('[VoiceInputService] continuous restart failed:', err);
        }
        return;
      }
      this.setListening(false);
      this.stopVadMonitor();

    };

    this.recognition = rec;
    try {
      rec.start();
      return true;
    } catch (err) {
      console.warn('[VoiceInputService] rec.start() failed:', err);
      return false;
    }
  }

  private _stopCurrentEngine(): void {
    this._intentionalStop = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (err) { console.debug('[VoiceInputService] recognition.stop() failed during engine stop:', err); }
      this.recognition = null;
    }
    this.stopVadMonitor();
    this._isRecording = false;
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
      try { this.recognition.stop(); } catch (err) { console.debug('[VoiceInputService] recognition.stop() failed during stop():', err); }
    }
    if (this._isRecording) {
      void this.stopRecording().catch((error) => {
        this.emitError(error instanceof Error ? error.message : '录音停止失败');
      });
    }
    this.setListening(false);
    this.stopVadMonitor();
    this.recognition = null;
    this.releaseSharedAnalysisStream();
  }

  /**
   * Start push-to-talk audio recording (for whisper-local engine).
   * Begins capturing microphone audio via MediaRecorder.
   * Call stopRecording() to stop and trigger transcription.
   */
  async startRecording(): Promise<void> {
    if (this._isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.mediaStream = stream;
      this.recordedChunks = [];
      // Prefer webm; fall back to any browser-supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        const err = (event as unknown as { error?: string }).error;
        this.emitError(`MediaRecorder error: ${typeof err === 'string' ? err : (err ?? 'unknown')}`);
      };
      this.mediaRecorder = recorder;
      recorder.start(100); // chunk every 100ms for responsive stop
      this._isRecording = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '录音启动失败';
      this.emitError(message);
      throw new Error(message);
    }
  }

  /**
   * Stop push-to-talk recording and transcribe the captured audio via whisper-server.
   * Emits the transcription result via onResult().
   * No-op if not currently recording.
   */
  async stopRecording(): Promise<void> {
    // Re-entrant guard: if a stop is already in flight, await it instead of racing
    // 竞态防护：如果已有 stop 正在执行，直接等待而非重入
    if (this._stopRecordingPromise) {
      await this._stopRecordingPromise;
      return;
    }
    if (!this._isRecording || !this.mediaRecorder) return;

    this._stopRecordingPromise = this._stopRecordingInternal();
    try {
      await this._stopRecordingPromise;
    } finally {
      this._stopRecordingPromise = null;
    }
  }

  private async _stopRecordingInternal(): Promise<void> {
    const recorder = this.mediaRecorder;
    if (!recorder) return;
    const stream = this.mediaStream;

    this._isRecording = false;
    this.mediaRecorder = null;
    this.mediaStream = null;

    // Wait for final chunk(s) and recorder stop event.
    await new Promise<void>((resolve, reject) => {
      const dataHandler = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      const stopHandler = () => {
        recorder.removeEventListener('dataavailable', dataHandler);
        recorder.removeEventListener('error', errorHandler as EventListener);
        resolve();
      };
      const errorHandler = (event: Event) => {
        recorder.removeEventListener('dataavailable', dataHandler);
        recorder.removeEventListener('stop', stopHandler as EventListener);
        const err = (event as unknown as { error?: string }).error;
        reject(new Error(typeof err === 'string' ? err : '录音停止失败'));
      };

      recorder.addEventListener('dataavailable', dataHandler);
      recorder.addEventListener('stop', stopHandler, { once: true });
      recorder.addEventListener('error', errorHandler as EventListener, { once: true });
      recorder.stop();
    });

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    if (this.recordedChunks.length === 0) {
      this.emitError('No audio recorded');
      return;
    }

    const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    this.recordedChunks = [];

    // Route based on the active engine: try the primary engine first,
    // fall back to the other if unavailable.
    const primaryEngine = this._currentEngine;

    if (primaryEngine === 'commercial' && this._config.commercialFallback) {
      try {
        const commercialResult = await this._config.commercialFallback.transcribe(
          audioBlob,
          this._config.lang,
        );
        this.emitResult(commercialResult);
        return;
      } catch (err) {
        // Commercial failed — try whisper-server as fallback
        await this._transcribeWithWhisperServerFallback(audioBlob, err);
        return;
      }
    }

    // Default: whisper-local (whisper-server on port 3040)
    await this._transcribeWithWhisperServerFallback(audioBlob, null);
  }

  /**
   * Try whisper-server, falling back to commercial STT if configured.
   * lastError is passed when called as secondary to a failed commercial attempt.
   */
  private async _transcribeWithWhisperServerFallback(audioBlob: Blob, lastError: unknown): Promise<void> {
    const baseUrl = this._config.whisperServerUrl?.replace(/\/+$/, '') ?? 'http://localhost:3040';
    const model = this._config.whisperServerModel ?? 'ggml-small-q5_k.bin';

    try {
      const result = await this.transcribeWithWhisperServer(audioBlob, baseUrl, model, this._config.lang);
      this.emitResult(result);
    } catch (err) {
      if (this._config.commercialFallback) {
        try {
          const commercialResult = await this._config.commercialFallback.transcribe(
            audioBlob,
            this._config.lang,
          );
          this.emitResult(commercialResult);
          return;
        } catch (fallbackErr) {
          console.warn('[VoiceInputService] commercial fallback transcription failed:', fallbackErr);
          // Commercial also failed — emit the original error
          this.emitError(lastError instanceof Error ? lastError.message : 'STT 转写失败');
          return;
        }
      }
      this.emitError(err instanceof Error ? err.message : 'STT 转写失败');
    }
  }

  /**
   * Transcribe an audio blob using whisper-server (OpenAI-compatible endpoint).
   *
   * Prefer /v1/audio/transcriptions. Some local setups or older proxies may still
   * expose /api/audio/transcriptions, so we probe both to reduce configuration drift.
   */
  private async transcribeWithWhisperServer(
    audioBlob: Blob,
    baseUrl: string,
    model: string,
    lang?: string,
  ): Promise<SttResult> {
    const endpoints = buildOllamaTranscriptionEndpoints(baseUrl);
    const failures: string[] = [];

    for (const endpoint of endpoints) {
      const body = new FormData();
      body.append('file', audioBlob, 'recording.webm');
      body.append('model', model);
      if (lang) body.append('language', lang);

      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          body,
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          failures.push(`${endpoint} -> ${resp.status} ${text}`.trim());
          continue;
        }

        const json = await resp.json() as { text?: string };
        return {
          text: json.text ?? '',
          lang: lang ?? 'unknown',
          isFinal: true,
          confidence: 1.0,
          engine: 'whisper-local',
          audioBlob,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${endpoint} -> ${message}`);
      }
    }

    throw new Error(`whisper-server 转写失败. 已尝试:\n${failures.join('\n')}`);
  }

  dispose(): void {
    this._disposed = true;
    this.stop();
    this.resultListeners = [];
    this.errorListeners = [];
    this.stateListeners = [];
    this.vadListeners = [];
    this.energyListeners = [];
    this.stopSilenceTimer();
    this.releaseSharedAnalysisStream();
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

  private async startVadMonitor(): Promise<void> {
    if (!this._config.vadEnabled) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (this.vadTimerId !== null) return;

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    try {
      stream = await this.createAnalysisCloneStream();
      if (!stream) return;

      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      this.vadStream = stream;
      this.vadAudioContext = audioContext;
      this.vadSource = source;
      this.vadAnalyser = analyser;
      this.vadLastSpeechTs = Date.now();

      const buffer = new Float32Array(analyser.fftSize);
      const rmsThreshold = this._config.vadRmsThreshold ?? DEFAULT_CONFIG.vadRmsThreshold ?? 0.018;
      const silenceMs = this._config.vadSilenceMs ?? DEFAULT_CONFIG.vadSilenceMs ?? 700;
      const intervalMs = this._config.vadFrameIntervalMs ?? DEFAULT_CONFIG.vadFrameIntervalMs ?? 80;

      this.vadTimerId = window.setInterval(() => {
        if (!this.vadAnalyser) return;
        this.vadAnalyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const sample = buffer[i] ?? 0;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / buffer.length);
        this._energyLevel = rms;
        for (const l of this.energyListeners) l(rms);

        const now = Date.now();
        if (rms >= rmsThreshold) {
          this.vadLastSpeechTs = now;
          this.lastSpeechTimestamp = now;
          this.setSpeaking(true);
          this.resetSilenceTimer();
          return;
        }
        if (now - this.vadLastSpeechTs >= silenceMs) {
          this.setSpeaking(false);
        }
        this.checkSilenceTimeout();
      }, intervalMs);
    } catch (err) {
      console.warn('[VoiceInputService] VAD monitor unavailable, continuing without VAD:', err);
      if (audioContext) {
        void audioContext.close();
      }
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      // VAD 为尽力增强能力，不可用时不应导致识别失败 | VAD is best-effort and must not fail recognition when unavailable.
    }
  }

  private stopVadMonitor(): void {
    if (this.vadTimerId !== null) {
      window.clearInterval(this.vadTimerId);
      this.vadTimerId = null;
    }
    this.stopSilenceTimer();

    this.vadSource?.disconnect();
    this.vadSource = null;
    this.vadAnalyser = null;

    if (this.vadAudioContext) {
      void this.vadAudioContext.close();
      this.vadAudioContext = null;
    }

    if (this.vadStream) {
      for (const track of this.vadStream.getTracks()) {
        track.stop();
      }
      this.vadStream = null;
    }

    this.setSpeaking(false);
  }

  /** Start / reset the silence timeout counter. */
  private resetSilenceTimer(): void {
    const maxSilenceMs = this._config.maxSilenceMs ?? 30_000;
    if (maxSilenceMs <= 0) return;
    this.stopSilenceTimer();
    this.lastSpeechTimestamp = Date.now();
    this.silenceTimerId = window.setTimeout(() => {
      if (!this._intentionalStop && this._listening) {
        this.stop();
      }
    }, maxSilenceMs);
  }

  private checkSilenceTimeout(): void {
    const maxSilenceMs = this._config.maxSilenceMs ?? 30_000;
    if (maxSilenceMs <= 0) return;
    if (Date.now() - this.lastSpeechTimestamp >= maxSilenceMs) {
      this.stop();
    }
  }

  private stopSilenceTimer(): void {
    if (this.silenceTimerId !== null) {
      window.clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }
  }
}
