/**
 * SpeechQualityAnalyzer — 实时音频质量分析
 *
 * 对麦克风输入音频流进行实时分析，计算：
 * - 信噪比（SNR）估算
 * - 信号能量水平
 * - 语音活跃度检测
 *
 * 用于：
 * - 动态切换 STT 引擎（低质量时切换到降噪更强的引擎）
 * - 提示用户改善录音环境
 * - 标记低质量音频句段
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段6
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudioQualityMetrics {
  /** Estimated signal-to-noise ratio in dB (-10 to +40 range) */
  snrDb: number;
  /** Signal (speech) energy level 0–1 */
  signalLevel: number;
  /** Noise energy level 0–1 */
  noiseLevel: number;
  /** Whether speech is currently detected */
  speechActive: boolean;
  /** Overall quality score 0–1 (computed from SNR) */
  qualityScore: number;
  /** Timestamp of this measurement */
  measuredAt: number;
}

export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor';

export interface SpeechQualityAnalyzerConfig {
  /** FFT size for frequency analysis (default 1024) */
  fftSize?: number;
  /** Noise floor estimation window in samples (default 30 frames) */
  noiseFloorWindow?: number;
  /** Speech detection threshold 0–1 (default 0.03) */
  speechThreshold?: number;
  /** SNR threshold for quality levels (dB) */
  snrThresholds?: {
    excellent?: number; // > 25 dB
    good?: number;       // > 15 dB
    fair?: number;       // > 5 dB
    // < 5 dB = poor
  };
}

export interface SegmentQualityRecord {
  segmentId: string;
  avgSnrDb: number;
  avgQualityScore: number;
  qualityLevel: QualityLevel;
  speechActiveRatio: number; // fraction of time speech was active
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SNR_THRESHOLDS = {
  excellent: 25,
  good: 15,
  fair: 5,
};

// ── SpeechQualityAnalyzer ─────────────────────────────────────────────────────

export class SpeechQualityAnalyzer {
  private static _instance: SpeechQualityAnalyzer | null = null;

  static getInstance(): SpeechQualityAnalyzer {
    if (!SpeechQualityAnalyzer._instance) {
      SpeechQualityAnalyzer._instance = new SpeechQualityAnalyzer();
    }
    return SpeechQualityAnalyzer._instance;
  }

  // ── State ────────────────────────────────────────────────────────────────

  private _config: Required<SpeechQualityAnalyzerConfig>;
  private _analyser: AnalyserNode | null = null;
  private _stream: MediaStream | null = null;
  private _audioContext: AudioContext | null = null;
  private _buffer: Float32Array | null = null;
  private _noiseFloor: number[] = [];
  private _speechHistory: boolean[] = [];
  private _listeners = new Set<(m: AudioQualityMetrics) => void>();
  private _rafId: number | null = null;
  private _active = false;
  private _sessionRecords: SegmentQualityRecord[] = [];

  private constructor() {
    this._config = {
      fftSize: 1024,
      noiseFloorWindow: 30,
      speechThreshold: 0.03,
      snrThresholds: DEFAULT_SNR_THRESHOLDS,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  get isActive(): boolean {
    return this._active;
  }

  get currentMetrics(): AudioQualityMetrics | null {
    return this._analyser && this._buffer
      ? this._analyzeFrame()
      : null;
  }

  /** Subscribe to real-time quality metrics (called ~60fps while active) */
  onMetrics(callback: (m: AudioQualityMetrics) => void): () => void {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }

  /**
   * Start analyzing the microphone input.
   * If a stream is already active, this is a no-op.
   */
  async start(): Promise<void> {
    if (this._active) return;

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._audioContext = new AudioContext();
      const source = this._audioContext.createMediaStreamSource(this._stream);
      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = this._config.fftSize;
      source.connect(this._analyser);
      this._buffer = new Float32Array(this._analyser.fftSize);
      this._noiseFloor = [];
      this._speechHistory = [];
      this._active = true;
      this._tick();
    } catch {
      // Microphone unavailable — silent failure
      this._active = false;
    }
  }

  /** Stop analysis and release resources */
  stop(): void {
    this._active = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._stream) {
      for (const track of this._stream.getTracks()) track.stop();
      this._stream = null;
    }
    if (this._audioContext) {
      void this._audioContext.close();
      this._audioContext = null;
    }
    this._analyser = null;
    this._buffer = null;
  }

  /**
   * Record the quality for a specific segment.
   */
  recordSegmentQuality(segmentId: string): SegmentQualityRecord | null {
    if (this._speechHistory.length === 0) return null;

    const speechActiveRatio = this._speechHistory.filter(Boolean).length / this._speechHistory.length;
    const metrics = this.currentMetrics;
    const avgSnrDb = metrics?.snrDb ?? 0;
    const avgQualityScore = metrics?.qualityScore ?? 0;

    const record: SegmentQualityRecord = {
      segmentId,
      avgSnrDb,
      avgQualityScore,
      qualityLevel: this._classifyQuality(avgSnrDb),
      speechActiveRatio,
    };

    this._sessionRecords.push(record);
    return record;
  }

  /** Get all recorded segment quality data for this session */
  getSessionRecords(): SegmentQualityRecord[] {
    return [...this._sessionRecords];
  }

  /** Get summary statistics for the current session */
  getSessionSummary(): { avgSnrDb: number; avgQualityScore: number; segmentsAnalyzed: number } | null {
    if (this._sessionRecords.length === 0) return null;
    const sum = this._sessionRecords.reduce(
      (acc, r) => ({
        avgSnrDb: acc.avgSnrDb + r.avgSnrDb,
        avgQualityScore: acc.avgQualityScore + r.avgQualityScore,
      }),
      { avgSnrDb: 0, avgQualityScore: 0 },
    );
    return {
      avgSnrDb: sum.avgSnrDb / this._sessionRecords.length,
      avgQualityScore: sum.avgQualityScore / this._sessionRecords.length,
      segmentsAnalyzed: this._sessionRecords.length,
    };
  }

  /**
   * Recommend STT engine based on current audio quality.
   */
  recommendSttEngine(): 'whisper-local' | 'commercial' | 'web-speech' {
    const metrics = this.currentMetrics;
    if (!metrics) return 'web-speech';

    if (metrics.qualityScore >= 0.8 && metrics.snrDb >= 20) {
      return 'whisper-local';
    }
    if (metrics.qualityScore < 0.4 || metrics.snrDb < 5) {
      return 'commercial'; // Commercial usually has better noise reduction
    }
    return 'web-speech';
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _tick = (): void => {
    if (!this._active) return;
    this._rafId = requestAnimationFrame(this._tick);

    if (!this._analyser || !this._buffer) return;

    this._analyser.getFloatTimeDomainData(this._buffer as Float32Array<ArrayBuffer>);
    const metrics = this._analyzeFrame();
    this._listeners.forEach((cb) => cb(metrics));
  };

  private _analyzeFrame(): AudioQualityMetrics {
    if (!this._buffer) {
      return this._createEmptyMetrics();
    }

    const buf = this._buffer;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const s = buf[i] ?? 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / buf.length);

    // Estimate noise floor from low-energy frames
    const isLowEnergy = rms < this._config.speechThreshold;
    if (isLowEnergy) {
      this._noiseFloor.push(rms);
      if (this._noiseFloor.length > this._config.noiseFloorWindow) {
        this._noiseFloor.shift();
      }
    }

    // Compute noise level from median of noise floor
    const sortedNoise = [...this._noiseFloor].sort((a, b) => a - b);
    const noiseLevel = sortedNoise.length > 0
      ? sortedNoise[Math.floor(sortedNoise.length / 2)] ?? 0
      : 0.001;

    // Signal level is the overall RMS
    const signalLevel = Math.min(rms * 5, 1); // scale to 0-1 roughly
    const noiseLevelNorm = Math.min(noiseLevel * 5, 1);

    // SNR in dB
    const snrDb = noiseLevel > 0
      ? Math.max(-10, Math.min(40, 20 * Math.log10(signalLevel / noiseLevelNorm + 0.001)))
      : 40;

    const speechActive = rms >= this._config.speechThreshold;
    this._speechHistory.push(speechActive);
    if (this._speechHistory.length > 300) { // ~5 seconds at 60fps
      this._speechHistory.shift();
    }

    const qualityScore = this._computeQualityScore(snrDb, speechActive);

    return {
      snrDb,
      signalLevel,
      noiseLevel: noiseLevelNorm,
      speechActive,
      qualityScore,
      measuredAt: Date.now(),
    };
  }

  private _computeQualityScore(snrDb: number, speechActive: boolean): number {
    const { snrThresholds: t } = this._config;
    const snrScore = snrDb >= (t.excellent ?? 25) ? 1
      : snrDb >= (t.good ?? 15) ? 0.8
      : snrDb >= (t.fair ?? 5) ? 0.5
      : 0.2;

    const activityBonus = speechActive ? 0.1 : 0;
    return Math.min(snrScore + activityBonus, 1);
  }

  private _classifyQuality(snrDb: number): QualityLevel {
    const { snrThresholds: t } = this._config;
    if (snrDb >= (t.excellent ?? 25)) return 'excellent';
    if (snrDb >= (t.good ?? 15)) return 'good';
    if (snrDb >= (t.fair ?? 5)) return 'fair';
    return 'poor';
  }

  private _createEmptyMetrics(): AudioQualityMetrics {
    return {
      snrDb: 0,
      signalLevel: 0,
      noiseLevel: 0,
      speechActive: false,
      qualityScore: 0,
      measuredAt: Date.now(),
    };
  }
}
