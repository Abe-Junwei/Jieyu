/**
 * AmbientObserver — 浏览器环境感知服务
 *
 * 实时监测浏览器环境状态，为 AI 决策提供上下文信息：
 * - 网络状态（online/offline）
 * - 电量状态（电池是否充电、剩余电量）
 * - 设备能力（CPU 核心数、内存）
 * - 页面可见性（是否在后台）
 * - 用户空闲状态（Idle Detection API）
 * - 会话运行时长
 *
 * 所有状态均可订阅，状态变化时主动通知。
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段6
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AmbientEnvironment {
  online: boolean;
  /** Estimated network type (may not be available in all browsers) */
  networkType: NetworkType | null;
  /** Battery charging state */
  batteryCharging: boolean;
  /** Battery level 0–1, null if API unavailable */
  batteryLevel: number | null;
  /** Device CPU logical cores */
  cpuCores: number;
  /** Device memory in GB (Chrome only), null if unavailable */
  deviceMemoryGb: number | null;
  /** Number of CPU logical cores */
  hardwareConcurrency: number;
  /** Whether the page is currently visible */
  pageVisible: boolean;
  /** Whether the user is idle (Idle Detection API) */
  userIdle: boolean;
  /** Whether the Idle Detection API is available in this browser */
  idleApiAvailable: boolean;
  /** Whether Idle Detection API permission has been granted */
  idlePermissionGranted: boolean;
  /** Session duration in ms (since page load or service start) */
  sessionDurationMs: number;
  /** Timestamp of last user activity */
  lastActivityAt: number;
  /** Timestamp of last environment state change */
  lastEnvironmentChangeAt: number;
}

export type NetworkType = 'bluetooth' | 'cellular' | 'wifi' | 'wimax' | 'other' | 'unknown';

export interface AmbientObserverConfig {
  /** Enable battery API monitoring (default true) */
  observeBattery?: boolean;
  /** Enable idle detection (default false — requires user permission) */
  observeIdle?: boolean;
  /** Idle threshold in ms (default 60000 = 1 min) */
  idleThresholdMs?: number;
  /** Poll interval for session duration (ms, default 1000) */
  pollIntervalMs?: number;
}

// ── AmbientObserver ───────────────────────────────────────────────────────────

export class AmbientObserver {
  private static _instance: AmbientObserver | null = null;

  static getInstance(): AmbientObserver {
    if (!AmbientObserver._instance) {
      AmbientObserver._instance = new AmbientObserver();
    }
    return AmbientObserver._instance;
  }

  // ── State ────────────────────────────────────────────────────────────────

  private _config: Required<AmbientObserverConfig>;
  private _env: AmbientEnvironment;
  private _listeners = new Set<(env: AmbientEnvironment) => void>();
  private _battery: BatteryManager | null = null;
  private _batteryUpdateHandler: (() => void) | null = null;
  private _activityHandler: (() => void) | null = null;
  private _idleController: IdleDetector | null = null;
  private _pollInterval: ReturnType<typeof setInterval> | null = null;
  private _sessionStart = Date.now();
  private _lastActivityAt = Date.now();

  private constructor() {
    this._config = {
      observeBattery: true,
      observeIdle: false,
      idleThresholdMs: 60000,
      pollIntervalMs: 1000,
    };

    const nav = navigator as NavigatorWithExtra;
    const idleApiAvailable = 'IdleDetector' in window;
    this._env = {
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      networkType: this._getNetworkType(),
      batteryCharging: false,
      batteryLevel: null,
      cpuCores: nav.hardwareConcurrency ?? 4,
      deviceMemoryGb: nav.deviceMemory ?? null,
      hardwareConcurrency: nav.hardwareConcurrency ?? 4,
      pageVisible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
      userIdle: false,
      idleApiAvailable,
      idlePermissionGranted: false,
      sessionDurationMs: 0,
      lastActivityAt: Date.now(),
      lastEnvironmentChangeAt: Date.now(),
    };

    this._setupNetworkListener();
    this._setupVisibilityListener();
    this._setupActivityTracking();
    this._startPoll();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Get current environment snapshot */
  get environment(): AmbientEnvironment {
    return { ...this._env };
  }

  /** Get current config */
  get config(): Readonly<Required<AmbientObserverConfig>> {
    return { ...this._config };
  }

  /** Subscribe to environment changes */
  onEnvironmentChange(callback: (env: AmbientEnvironment) => void): () => void {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(partial: Partial<AmbientObserverConfig>): void {
    this._config = { ...this._config, ...partial };
    if ('observeIdle' in partial) {
      if (this._config.observeIdle) {
        void this._startIdleDetection();
      } else {
        this._stopIdleDetection();
      }
    }
  }

  /** Record a user activity timestamp (resets idle detection) */
  recordActivity(): void {
    this._lastActivityAt = Date.now();
    this._env = { ...this._env, lastActivityAt: this._lastActivityAt, userIdle: false };
  }

  /** Start battery monitoring */
  async startBatteryMonitoring(): Promise<void> {
    if (!this._config.observeBattery) return;
    this._battery = await this._getBattery();
    if (!this._battery) return;

    const update = () => {
      this._env = {
        ...this._env,
        batteryCharging: this._battery!.charging,
        batteryLevel: this._battery!.level,
        lastEnvironmentChangeAt: Date.now(),
      };
      this._notify();
    };

    this._batteryUpdateHandler = update;
    this._battery.addEventListener('chargingchange', update);
    this._battery.addEventListener('levelchange', update);
    update();
  }

  /** Stop all monitoring and release resources */
  stop(): void {
    this._stopPoll();
    this._stopIdleDetection();
    // 移除电池监听器 | Remove battery listeners
    if (this._battery && this._batteryUpdateHandler) {
      this._battery.removeEventListener('chargingchange', this._batteryUpdateHandler);
      this._battery.removeEventListener('levelchange', this._batteryUpdateHandler);
      this._batteryUpdateHandler = null;
    }
    this._battery = null;
    // 移除活动跟踪监听器 | Remove activity tracking listeners
    if (this._activityHandler) {
      for (const ev of ['mousedown', 'keydown', 'touchstart', 'scroll']) {
        document.removeEventListener(ev, this._activityHandler);
      }
      this._activityHandler = null;
    }
    window.removeEventListener('online', this._onNetworkChange);
    window.removeEventListener('offline', this._onNetworkChange);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._listeners.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _notify(): void {
    this._listeners.forEach((cb) => cb({ ...this._env }));
  }

  private _updateEnv(patch: Partial<AmbientEnvironment>): void {
    this._env = { ...this._env, ...patch, lastEnvironmentChangeAt: Date.now() };
    this._notify();
  }

  private _setupNetworkListener(): void {
    window.addEventListener('online', this._onNetworkChange);
    window.addEventListener('offline', this._onNetworkChange);
  }

  private _onNetworkChange = (): void => {
    this._updateEnv({ online: navigator.onLine, networkType: this._getNetworkType() });
  };

  private _getNetworkType(): NetworkType | null {
    const nav = navigator as NavigatorWithExtra;
    const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
    if (!conn) return null;
    return (conn.type ?? 'unknown') as NetworkType;
  }

  private _setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  private _onVisibilityChange = (): void => {
    const visible = document.visibilityState === 'visible';
    this._updateEnv({ pageVisible: visible });
  };

  private _setupActivityTracking(): void {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => {
      this.recordActivity();
    };
    this._activityHandler = handler;
    for (const ev of events) {
      document.addEventListener(ev, handler, { passive: true });
    }
  }

  private _startPoll(): void {
    this._pollInterval = setInterval(() => {
      const sessionDurationMs = Date.now() - this._sessionStart;
      if (sessionDurationMs !== this._env.sessionDurationMs) {
        this._env = { ...this._env, sessionDurationMs };
        this._notify();
      }
    }, this._config.pollIntervalMs);
  }

  private _stopPoll(): void {
    if (this._pollInterval !== null) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  private async _getBattery(): Promise<BatteryManager | null> {
    if (!('getBattery' in navigator)) return null;
    try {
      return await (navigator as NavigatorWithBattery).getBattery();
    } catch {
      return null;
    }
  }

  private async _startIdleDetection(): Promise<void> {
    if (!('IdleDetector' in window)) return;
    try {
      this._idleController = new IdleDetector();
      await this._idleController.start({ threshold: this._config.idleThresholdMs });
      this._updateEnv({ idlePermissionGranted: true });
      this._idleController.addEventListener('change', () => {
        const idle = this._idleController!.userState === 'idle';
        this._updateEnv({ userIdle: idle });
      });
    } catch {
      // Idle Detection API not permitted or unavailable
      this._updateEnv({ idlePermissionGranted: false });
    }
  }

  private _stopIdleDetection(): void {
    if (this._idleController) {
      this._idleController.stop();
      this._idleController = null;
    }
    this._env = { ...this._env, userIdle: false, idlePermissionGranted: false };
  }
}

// ── Type declarations (not in standard lib) ─────────────────────────────────

interface IdleDetector extends EventTarget {
  userState: 'active' | 'idle';
  screenState: 'locked' | 'unlocked';
  start(options?: { threshold?: number }): Promise<void>;
  stop(): void;
}

declare var IdleDetector: {
  prototype: IdleDetector;
  new (): IdleDetector;
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface BatteryManager extends EventTarget {
  readonly charging: boolean;
  readonly level: number;
  readonly chargingTime: number;
  readonly dischargingTime: number;
}

interface NavigatorWithBattery extends Navigator {
  getBattery(): Promise<BatteryManager>;
}

interface NavigatorWithExtra extends Navigator {
  deviceMemory?: number;
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

interface NetworkInformation extends EventTarget {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}
