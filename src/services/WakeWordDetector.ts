/**
 * WakeWordDetector — 唤醒词检测（离线，零依赖）
 *
 * 使用 Web Audio API 连续监听麦克风能量，
 * 当能量超过阈值时触发"唤醒"，自动启动语音助手。
 *
 * 检测逻辑：
 *   1. 连续采样 RMS 能量（AudioContext AnalyserNode）
 *   2. 能量突破 threshold → 记录触发时刻
 *   3. 触发后持续 speechMs 毫秒以上 → 确认唤醒
 *   4. 唤醒后自动调用 onWake() 回调，然后停止监听（等待 voice agent 关闭后重启）
 *
 * 零网络依赖，完全在浏览器本地运行。
 */

export interface WakeWordDetectorOptions {
  /** RMS 能量阈值 0–1，默认 0.05（灵敏） */
  energyThreshold?: number;
  /** 触发后持续 speechMs 毫秒以上才确认唤醒，默认 400ms */
  speechMs?: number;
  /** 两次唤醒之间的最短间隔（ms），默认 3000ms */
  cooldownMs?: number;
  /** 唤醒时回调 */
  onWake: () => void;
  /** 可选：每次能量更新回调（用于可视化） */
  onEnergy?: (rms: number) => void;
}

export class WakeWordDetector {
  private readonly energyThreshold: number;
  private readonly speechMs: number;
  private readonly cooldownMs: number;
  private readonly onWake: () => void;
  private readonly onEnergy: ((rms: number) => void) | undefined;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId: number | null = null;
  private buffer: Float32Array | null = null;
  private _active = false;

  /** 最后一次触发时间戳 */
  private lastTriggerTs = 0;
  /** 触发后持续 speech 的开始时间 */
  private speechStartTs: number | null = null;
  /** 是否正在啸叫（检测中） */
  private triggered = false;

  constructor(options: WakeWordDetectorOptions) {
    this.energyThreshold = options.energyThreshold ?? 0.05;
    this.speechMs = options.speechMs ?? 400;
    this.cooldownMs = options.cooldownMs ?? 3000;
    this.onWake = options.onWake;
    this.onEnergy = options.onEnergy;
  }

  get active(): boolean {
    return this._active;
  }

  /** 开始连续监听麦克风 */
  async start(): Promise<void> {
    if (this._active) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new AudioContext();
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.source.connect(this.analyser);
      this.buffer = new Float32Array(this.analyser.fftSize);
      this.triggered = false;
      this.speechStartTs = null;
      this._active = true;
      this._tick();
    } catch (err) {
      console.warn('[WakeWordDetector] start failed, microphone unavailable:', err);
      this._active = false;
    }
  }

  /** 停止监听，释放资源 */
  stop(): void {
    this._active = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
    this.buffer = null;
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.triggered = false;
    this.speechStartTs = null;
  }

  private _tick = (): void => {
    if (!this._active || !this.analyser || !this.buffer) return;

    this.analyser.getFloatTimeDomainData(this.buffer as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i += 1) {
      const s = this.buffer[i] ?? 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / this.buffer.length);
    this.onEnergy?.(rms);

    const now = Date.now();

    if (rms >= this.energyThreshold) {
      if (!this.triggered) {
        // 首次触发 | first trigger
        this.triggered = true;
        this.speechStartTs = now;
      } else if (this.speechStartTs !== null) {
        // 持续触发中，检查是否达到 speechMs
        if (now - this.speechStartTs >= this.speechMs) {
          // 确认唤醒 | wake confirmed
          if (now - this.lastTriggerTs >= this.cooldownMs) {
            this.lastTriggerTs = now;
            this.onWake();
          }
          // 停止本次监听，等待下次 voice agent 关闭后重启
          this.stop();
          return;
        }
      }
    } else {
      // 能量下降，重置触发状态 | energy dropped, reset trigger state
      this.triggered = false;
      this.speechStartTs = null;
    }

    this.rafId = requestAnimationFrame(this._tick);
  };
}
