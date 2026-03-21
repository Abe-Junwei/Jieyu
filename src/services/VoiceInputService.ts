/**
 * VoiceInputService — 语音采集与识别
 *
 * 统一管理麦克风权限、音频流、STT 转写。
 * 支持 Web Speech API、Ollama Whisper Local、以及可插拔的商业模型接口。
 *
 * @see 解语-语音智能体架构设计方案 §4.1
 */

// ── Types ──

export type SttEngine = 'web-speech' | 'whisper' | 'whisper-local' | 'commercial';

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
  maxAlternatives?: number;      // default 3
  vadEnabled?: boolean;
  vadRmsThreshold?: number;
  vadSilenceMs?: number;
  vadFrameIntervalMs?: number;
  /** Auto-stop after this many ms of continuous silence (VAD-triggered). Default: 30000. */
  maxSilenceMs?: number;
  /** Ollama base URL for whisper-local engine, e.g. 'http://localhost:11434' */
  ollamaBaseUrl?: string;
  /** Ollama whisper model name, e.g. 'whisper-small' */
  ollamaModel?: string;
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

/** Built-in commercial provider kinds for UI display. */
export type CommercialProviderKind = 'gemini' | 'openai-audio' | 'groq' | 'custom-http' | 'minimax' | 'volcengine';

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
      echoCancellation: settings.echoCancellation ?? false,
      noiseSuppression: settings.noiseSuppression ?? false,
      autoGainControl: settings.autoGainControl ?? false,
    };
  } catch {
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
 * Usage (Ollama Whisper Local — push-to-talk):
 *   const svc = new VoiceInputService();
 *   svc.onResult(result => { ... });
 *   svc.start({ lang: 'ja-JP', preferredEngine: 'whisper-local', ollamaBaseUrl: 'http://localhost:11434', ollamaModel: 'whisper-small' });
 *   // Press-and-hold:
 *   svc.startRecording();  // begins MediaRecorder capture
 *   svc.stopRecording();   // stops capture, sends to Ollama, emits result via onResult
 */
export class VoiceInputService {
  private recognition: SpeechRecognition | null = null;
  private _listening = false;
  private _config: VoiceInputConfig = DEFAULT_CONFIG;
  private _intentionalStop = false;
  private _speaking = false;

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
  private recordedChunks: Blob[] = [];
  private _isRecording = false;

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

  get listening(): boolean {
    return this._listening;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  get engine(): SttEngine {
    return this._currentEngine;
  }

  /** Ordered fallback chain tried when the preferred engine fails. */
  private get fallbackChain(): SttEngine[] {
    return ['web-speech', 'whisper-local', 'commercial'];
  }

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

  // ── Lifecycle ──

  start(config?: Partial<VoiceInputConfig>): void {
    if (this._listening) return;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._intentionalStop = false;
    void this._attemptEngineWithFallback(this._config.preferredEngine);
  }

  /**
   * Switch to a different STT engine while already listening.
   * Stops the current engine and starts the new one.
   */
  switchEngine(engine: SttEngine): void {
    if (!this._listening) return;
    this._intentionalStop = false;
    this._stopCurrentEngine();
    this._currentEngine = engine;
    setTimeout(() => {
      if (!this._listening) return;
      try {
        void this._attemptEngineWithFallback(engine);
      } catch (err) {
        console.error('[VoiceInput] switchEngine error:', err);
      }
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
      case 'whisper-local': return 'Ollama Whisper';
      case 'commercial': return '商业 STT';
      default: return e;
    }
  }

  /**
   * Start a specific engine. Returns true if the engine started successfully.
   */
  private _startEngine(engine: SttEngine): boolean {
    console.log('[DEBUG] _startEngine:', engine);
    switch (engine) {
      case 'web-speech':
        return this._startWebSpeech();
      case 'whisper-local':
        // whisper-local requires push-to-talk; mark as listening so the UI can show it,
        // but the user must press-and-hold to record.
        this._listening = true;
        this.emitState(true);
        console.log('[DEBUG] _startEngine: whisper-local listening=true');
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
          if (alt) alternatives.push({ text: alt.transcript, confidence: alt.confidence });
        }

        const sttResult: SttResult = {
          text: primary.transcript,
          lang: this._config.lang,
          isFinal: result.isFinal,
          confidence: primary.confidence,
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
      if (this._listening && !this._intentionalStop && this._config.continuous) {
        try {
          rec.start();
        } catch {
          this.setListening(false);
        }
        return;
      }
      this.setListening(false);
      this.stopVadMonitor();
    };

    this.recognition = rec;
    try {
      // Small delay to let the MediaStream microphone stabilize before the
      // browser's internal VAD initializes. Without this, the first few
      // hundred milliseconds of audio can be dropped causing immediate
      // "no-speech" errors on some browsers/devices.
      setTimeout(() => { try { rec.start(); } catch { /* already stopped */ } }, 150);
      return true;
    } catch {
      return false;
    }
  }

  private _stopCurrentEngine(): void {
    console.log('[DEBUG] _stopCurrentEngine: entry');
    this._intentionalStop = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
    console.log('[DEBUG] _stopCurrentEngine: recognition stopped');
    this.stopVadMonitor();
    console.log('[DEBUG] _stopCurrentEngine: VAD stopped');
    this._isRecording = false;
    this._intentionalStop = true;
    console.log('[DEBUG] _stopCurrentEngine: done');
  }

  stop(): void {
    this._intentionalStop = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }
    if (this._isRecording) {
      this.mediaRecorder?.stop();
      for (const track of (this.mediaStream?.getTracks() ?? [])) track.stop();
      this._isRecording = false;
    }
    this.setListening(false);
    this.stopVadMonitor();
    this.recognition = null;
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
      this.emitError(err instanceof Error ? err.message : 'Failed to start audio recording');
    }
  }

  /**
   * Stop push-to-talk recording and transcribe the captured audio via Ollama Whisper Local.
   * Emits the transcription result via onResult().
   * No-op if not currently recording.
   */
  async stopRecording(): Promise<void> {
    if (!this._isRecording || !this.mediaRecorder) return;

    const recorder = this.mediaRecorder;
    const stream = this.mediaStream;

    this._isRecording = false;
    this.mediaRecorder = null;
    this.mediaStream = null;

    recorder.stop();
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    // Wait for the recorder to finish delivering all chunks
    await new Promise<void>((resolve) => {
      // One final dataavailable event fires after stop() with all remaining chunks
      const handler = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
        recorder.removeEventListener('dataavailable', handler);
        resolve();
      };
      recorder.addEventListener('dataavailable', handler);
    });

    if (this.recordedChunks.length === 0) {
      this.emitError('No audio recorded');
      return;
    }

    const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    this.recordedChunks = [];

    // Transcribe via Ollama Whisper; fall back to commercial provider on failure
    const baseUrl = this._config.ollamaBaseUrl?.replace(/\/+$/, '') ?? 'http://localhost:11434';
    const model = this._config.ollamaModel ?? 'whisper-small';

    try {
      const result = await this.transcribeWithOllamaWhisper(audioBlob, baseUrl, model, this._config.lang);
      this.emitResult(result);
    } catch (ollamaErr) {
      // Ollama failed — try commercial fallback if configured
      if (this._config.commercialFallback) {
        try {
          const commercialResult = await this._config.commercialFallback.transcribe(
            audioBlob,
            this._config.lang,
          );
          this.emitResult(commercialResult);
          return;
        } catch {
          // Commercial also failed — emit the original Ollama error
          this.emitError(ollamaErr instanceof Error ? ollamaErr.message : 'Ollama Whisper transcription failed');
          return;
        }
      }
      this.emitError(ollamaErr instanceof Error ? ollamaErr.message : 'Ollama Whisper transcription failed');
    }
  }

  /**
   * Transcribe an audio blob using Ollama's /api/audio/transcriptions endpoint.
   */
  private async transcribeWithOllamaWhisper(
    audioBlob: Blob,
    baseUrl: string,
    model: string,
    lang?: string,
  ): Promise<SttResult> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', model);
    if (lang) formData.append('language', lang);

    const resp = await fetch(`${baseUrl}/api/audio/transcriptions`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Ollama Whisper failed: ${resp.status} ${text}`);
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
  }

  dispose(): void {
    this.stop();
    if (this._isRecording) {
      this.mediaRecorder?.stop();
      for (const track of (this.mediaStream?.getTracks() ?? [])) {
        track.stop();
      }
      this._isRecording = false;
    }
    this.resultListeners = [];
    this.errorListeners = [];
    this.stateListeners = [];
    this.vadListeners = [];
    this.energyListeners = [];
    this.stopSilenceTimer();
  }

  // ── Private ──

  private setListening(value: boolean): void {
    if (this._listening !== value) {
      this._listening = value;
      this.emitState(value);
    }
  }

  private emitResult(result: SttResult): void {
    for (const fn of this.resultListeners) fn(result);
  }

  private emitError(error: string): void {
    for (const fn of this.errorListeners) fn(error);
  }

  private emitState(listening: boolean): void {
    for (const fn of this.stateListeners) fn(listening);
  }

  private emitVadState(speaking: boolean): void {
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioContext = new AudioContext();
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
    } catch {
      // VAD is best-effort only; don't fail voice recognition when unavailable.
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
