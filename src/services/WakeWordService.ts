/**
 * WakeWordService — 语音唤醒服务（高级封装）
 *
 * 对 WakeWordDetector 的高级封装，提供：
 * - 与 VoiceAgentService 的联动（唤醒后自动触发语音助手）
 * - 多监听器订阅机制
 * - 持久化偏好（IndexedDB）
 * - 激活/停用切换
 * - 能量数据回调（用于 UI 可视化）
 *
 * 使用方式：
 *   const svc = WakeWordService.getInstance();
 *   svc.onWake(() => { console.log('Wake!'); });
 *   await svc.start();
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段5
 */

import { WakeWordDetector } from './WakeWordDetector';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WakeWordServiceConfig {
  /** 是否在启动时自动开始监听 */
  autoStart?: boolean;
  /** RMS 能量阈值 0–1，默认 0.05 */
  energyThreshold?: number;
  /** 触发后持续 speechMs 毫秒以上才确认唤醒，默认 400ms */
  speechMs?: number;
  /** 两次唤醒之间的最短间隔（ms），默认 3000ms */
  cooldownMs?: number;
  /** 是否启用（用户可关闭） */
  enabled?: boolean;
}

export interface WakeWordServiceState {
  active: boolean;
  enabled: boolean;
  lastWakeAt: number | null;
  totalWakeCount: number;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const CONFIG_KEY = 'jieyu-wakeword-config';

// ── WakeWordService ───────────────────────────────────────────────────────────

export class WakeWordService {
  private static _instance: WakeWordService | null = null;

  static getInstance(): WakeWordService {
    if (!WakeWordService._instance) {
      WakeWordService._instance = new WakeWordService();
    }
    return WakeWordService._instance;
  }

  // ── State ────────────────────────────────────────────────────────────────

  private _config: Required<WakeWordServiceConfig>;
  private _detector: WakeWordDetector | null = null;
  private _listeners = new Set<() => void>();
  private _energyListeners = new Set<(rms: number) => void>();
  private _state: WakeWordServiceState = {
    active: false,
    enabled: true,
    lastWakeAt: null,
    totalWakeCount: 0,
  };

  private constructor() {
    const saved = this._loadConfig();
    this._config = {
      autoStart: saved?.autoStart ?? false,
      energyThreshold: saved?.energyThreshold ?? 0.05,
      speechMs: saved?.speechMs ?? 400,
      cooldownMs: saved?.cooldownMs ?? 3000,
      enabled: saved?.enabled ?? true,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  get state(): WakeWordServiceState {
    return { ...this._state };
  }

  get config(): Readonly<Required<WakeWordServiceConfig>> {
    return { ...this._config };
  }

  /** Subscribe to wake events */
  onWake(callback: () => void): () => void {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }

  /** Subscribe to energy level updates (for UI visualization) */
  onEnergy(callback: (rms: number) => void): () => void {
    this._energyListeners.add(callback);
    return () => { this._energyListeners.delete(callback); };
  }

  /**
   * Start listening for wake words.
   * Idempotent — calling while already active is a no-op.
   */
  async start(): Promise<void> {
    if (this._state.active) return;
    if (!this._config.enabled) return;

    // Lazily create detector
    if (!this._detector) {
      this._detector = new WakeWordDetector({
        energyThreshold: this._config.energyThreshold,
        speechMs: this._config.speechMs,
        cooldownMs: this._config.cooldownMs,
        onWake: this._handleWake.bind(this),
        onEnergy: (rms) => {
          this._energyListeners.forEach((cb) => cb(rms));
        },
      });
    }

    await this._detector.start();
    this._state = { ...this._state, active: this._detector.active };
  }

  /**
   * Stop listening.
   */
  stop(): void {
    this._detector?.stop();
    this._state = { ...this._state, active: false };
  }

  /**
   * Temporarily pause listening (e.g., during active voice session).
   * Use resume() to restart.
   */
  pause(): void {
    this.stop();
  }

  /**
   * Resume listening after pause.
   */
  async resume(): Promise<void> {
    await this.start();
  }

  /**
   * Update configuration (persisted to localStorage).
   */
  updateConfig(partial: Partial<WakeWordServiceConfig>): void {
    this._config = { ...this._config, ...partial };
    this._saveConfig(this._config);
  }

  /**
   * Enable or disable wake word detection.
   */
  setEnabled(enabled: boolean): void {
    this.updateConfig({ enabled });
    this._state = { ...this._state, enabled };
    if (!enabled) {
      this.stop();
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _handleWake(): void {
    const now = Date.now();
    this._state = {
      ...this._state,
      lastWakeAt: now,
      totalWakeCount: this._state.totalWakeCount + 1,
    };

    // Notify all listeners
    this._listeners.forEach((cb) => cb());
  }

  private _loadConfig(): Partial<WakeWordServiceConfig> | null {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private _saveConfig(config: Required<WakeWordServiceConfig>): void {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      // localStorage unavailable
    }
  }
}
