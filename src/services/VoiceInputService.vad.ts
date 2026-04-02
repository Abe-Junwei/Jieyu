/**
 * VoiceInputService.vad — VAD 运行时监视器
 * VAD (Voice Activity Detection) runtime monitor
 *
 * Extracted from VoiceInputService to keep the main file focused on lifecycle and engine management.
 */

import { createLogger } from '../observability/logger';

const log = createLogger('VoiceInputService.vad');

export interface VadConfig {
  vadEnabled?: boolean;
  vadRmsThreshold?: number;
  vadSilenceMs?: number;
  vadFrameIntervalMs?: number;
  maxSilenceMs?: number;
}

export interface VadMonitorCallbacks {
  /** 获取分析用克隆音频流 | Get cloned audio stream for analysis */
  createAnalysisCloneStream: () => Promise<MediaStream | null>;
  /** 更新说话状态 | Update speaking state */
  setSpeaking: (value: boolean) => void;
  /** 发出能量值更新 | Emit energy level update */
  emitEnergyLevel: (rms: number) => void;
  /** 停止输入（静音超时） | Stop input (silence auto-stop) */
  stop: () => void;
  /** 是否已关闭 | Whether disposed */
  isDisposed: () => boolean;
  /** 是否正在监听 | Whether listening */
  isListening: () => boolean;
  /** 是否主动停止 | Whether intentionally stopped */
  isIntentionalStop: () => boolean;
}

const DEFAULT_RMS_THRESHOLD = 0.018;
const DEFAULT_SILENCE_MS = 700;
const DEFAULT_FRAME_INTERVAL_MS = 80;
const DEFAULT_MAX_SILENCE_MS = 30_000;

/**
 * VAD 运行时监视器 | VAD runtime monitor
 * Manages microphone audio analysis for voice activity detection and silence timeout.
 */
export class VadMonitorRuntime {
  private vadStream: MediaStream | null = null;
  private vadAudioContext: AudioContext | null = null;
  private vadAnalyser: AnalyserNode | null = null;
  private vadSource: MediaStreamAudioSourceNode | null = null;
  private vadTimerId: number | null = null;
  private vadLastSpeechTs = 0;

  private silenceTimerId: number | null = null;
  private lastSpeechTimestamp = 0;
  private _energyLevel = 0;

  constructor(private readonly callbacks: VadMonitorCallbacks) {}

  get energyLevel(): number {
    return this._energyLevel;
  }

  async start(config: VadConfig): Promise<void> {
    if (!config.vadEnabled) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (this.vadTimerId !== null) return;

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    try {
      stream = await this.callbacks.createAnalysisCloneStream();
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
      const rmsThreshold = config.vadRmsThreshold ?? DEFAULT_RMS_THRESHOLD;
      const silenceMs = config.vadSilenceMs ?? DEFAULT_SILENCE_MS;
      const intervalMs = config.vadFrameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
      const maxSilenceMs = config.maxSilenceMs ?? DEFAULT_MAX_SILENCE_MS;

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
        this.callbacks.emitEnergyLevel(rms);

        const now = Date.now();
        if (rms >= rmsThreshold) {
          this.vadLastSpeechTs = now;
          this.lastSpeechTimestamp = now;
          this.callbacks.setSpeaking(true);
          this.resetSilenceTimer(maxSilenceMs);
          return;
        }
        if (now - this.vadLastSpeechTs >= silenceMs) {
          this.callbacks.setSpeaking(false);
        }
        this.checkSilenceTimeout(maxSilenceMs);
      }, intervalMs);
    } catch (err) {
      log.warn('VAD monitor unavailable, continuing without VAD', { err });
      if (audioContext) {
        void audioContext.close();
      }
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      // VAD is best-effort and must not fail recognition when unavailable.
    }
  }

  stop(): void {
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

    this.callbacks.setSpeaking(false);
  }

  // ── Silence timer | 静音计时 ─────────────────────────────────────────────

  resetSilenceTimer(maxSilenceMs: number): void {
    if (maxSilenceMs <= 0) return;
    this.stopSilenceTimer();
    this.lastSpeechTimestamp = Date.now();
    this.silenceTimerId = window.setTimeout(() => {
      if (!this.callbacks.isIntentionalStop() && this.callbacks.isListening()) {
        this.callbacks.stop();
      }
    }, maxSilenceMs);
  }

  checkSilenceTimeout(maxSilenceMs: number): void {
    if (maxSilenceMs <= 0) return;
    if (Date.now() - this.lastSpeechTimestamp >= maxSilenceMs) {
      this.callbacks.stop();
    }
  }

  stopSilenceTimer(): void {
    if (this.silenceTimerId !== null) {
      window.clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }
  }
}
