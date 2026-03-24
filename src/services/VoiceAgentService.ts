/**
 * VoiceAgentService — 语音智能体业务逻辑类（非 React）
 *
 * 从 useVoiceAgent hook 中提取的核心逻辑，作为单例 service 暴露给所有页面。
 *
 * 设计原则：
 * - 不依赖 React，不使用 useState/useEffect/useCallback
 * - 所有状态通过事件派发，外部通过订阅机制获取
 * - 与 useVoiceAgent hook 共享实现，保持向后兼容
 *
 * @see 解语语音智能体架构设计方案 v2.5 §阶段1
 */

import type { VoiceInputService as VoiceInputServiceType, SttEngine, SttResult, CommercialProviderKind } from './VoiceInputService';
import type { WakeWordDetector as WakeWordDetectorType } from './WakeWordDetector';
import { AmbientObserver } from './AmbientObserver';
import { SpeechQualityAnalyzer } from './SpeechQualityAnalyzer';
import { saveVoiceSession, loadRecentVoiceSessions } from './VoiceSessionStore';
import { projectMemoryStore } from './ProjectMemoryStore';
import {
  SpeechAnnotationPipeline,
  type QuickDictationConfig,
  type DictationPipelineCallbacks,
} from './SpeechAnnotationPipeline';
import {
  routeIntent,
  isDestructiveAction,
  shouldConfirmFuzzyAction,
  getActionLabel,
  createVoiceSession,
  loadVoiceIntentAliasMap,
  learnVoiceIntentAlias,
  bumpAliasUsage,
  type ActionId,
  type VoiceIntent,
  type VoiceSession,
  type VoiceSessionEntry,
} from './IntentRouter';
import { toBcp47 } from '../utils/langMapping';
import type { CommercialProviderCreateConfig } from './stt';
import { resolveVoiceAgentRuntimeConfig } from './config/voiceAgentRuntimeConfig';
import { detectRegion } from '../utils/regionDetection';
import * as Earcon from './EarconService';
import { unlockAudio } from './EarconService';
import { globalContext } from './GlobalContextService';
import { userBehaviorStore } from './UserBehaviorStore';
import { refineLlmFallbackIntent } from './voiceIntentRefine';
import { createLogger } from '../observability/logger';

const log = createLogger('VoiceAgentService');

// ── Lazy runtime loaders | 运行时懒加载器 ─────────────────────────────────────

let voiceInputRuntimePromise: Promise<typeof import('./VoiceInputService')> | null = null;
let wakeWordRuntimePromise: Promise<typeof import('./WakeWordDetector')> | null = null;
let sttRuntimePromise: Promise<typeof import('./stt')> | null = null;
let sttStrategyRuntimePromise: Promise<typeof import('./SttStrategyRouter')> | null = null;

function loadVoiceInputRuntime() {
  if (!voiceInputRuntimePromise) {
    voiceInputRuntimePromise = import('./VoiceInputService');
  }
  return voiceInputRuntimePromise;
}

function loadWakeWordRuntime() {
  if (!wakeWordRuntimePromise) {
    wakeWordRuntimePromise = import('./WakeWordDetector');
  }
  return wakeWordRuntimePromise;
}

function loadSttRuntime() {
  if (!sttRuntimePromise) {
    sttRuntimePromise = import('./stt');
  }
  return sttRuntimePromise;
}

function loadSttStrategyRuntime() {
  if (!sttStrategyRuntimePromise) {
    sttStrategyRuntimePromise = import('./SttStrategyRouter');
  }
  return sttStrategyRuntimePromise;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

// ── Grounding Context (Stage 2) ───────────────────────────────────────────────

export interface GroundingContextData {
  currentSegment: {
    id: string;
    index: number;
    text: string;
    translation: string | null;
    gloss: string | null;
    isMarked: boolean;
    durationSeconds: number;
  } | null;
  selectedSegmentIds: string[];
  totalSegments: number;
  userProfile: {
    preferredMode: string;
    mostUsedAction: string | null;
    fatigueScore: number;
    confirmationPreference: 'always' | 'destructive-only' | 'never';
  };
  currentPhase: string;
  attentionHotspots: Array<{ segmentId: string; index: number; score: number }>;
  relevantCorpus: Array<{
    segmentId: string;
    text: string;
    translation: string | null;
    score: number;
    source: 'transcription' | 'translation' | 'gloss' | 'document';
  }>;
  aiAdoptionRate: number | null;
  contextBuiltAt: number;
}

export interface VoiceAgentServiceState {
  listening: boolean;
  speechActive: boolean;
  mode: VoiceAgentMode;
  interimText: string;
  finalText: string;
  confidence: number;
  lastIntent: VoiceIntent | null;
  error: string | null;
  safeMode: boolean;
  pendingConfirm: { actionId: ActionId; label: string; fromFuzzy?: boolean } | null;
  session: VoiceSession;
  engine: SttEngine;
  isRecording: boolean;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
  energyLevel: number;
  recordingDuration: number;
  wakeWordEnabled: boolean;
  wakeWordEnergyLevel: number;
  detectedLang: string | null;
  // Multi-agent pipeline state
  agentState: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking';
  // Grounding context (Stage 2)
  groundingContext: GroundingContextData;
}

export interface VoiceAgentServiceOptions {
  corpusLang?: string;
  langOverride?: string | null;
  initialSafeMode?: boolean;
  initialWakeWordEnabled?: boolean;
  /** Whisper-server URL for whisper-local engine (port 3040) */
  whisperServerUrl?: string;
  /** Whisper-server model name */
  whisperServerModel?: string;
  commercialProviderKind?: CommercialProviderKind;
  commercialProviderConfig?: CommercialProviderCreateConfig;
  /** Called when the user confirms a pending action */
  onExecuteAction?: (actionId: ActionId, params?: { segmentIndex?: number }) => void;
  /** Called for dictation text insertion */
  onInsertDictation?: (text: string) => void;
  /** Called for AI chat / analysis mode */
  onSendToAiChat?: (text: string) => void;
  /** Called when a VoiceActionTool intent is resolved — routes to useAiToolCallHandler */
  onToolCall?: (call: { name: string; arguments: Record<string, unknown> }) => Promise<{ ok: boolean; message: string }>;
  /** Optional LLM resolver for complex commands */
  resolveIntentWithLlm?: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
}

// ── Defaults ────────────────────────────────────────────────────────────────

function createInitialSession(): VoiceSession {
  return createVoiceSession();
}

// ── VoiceAgentService ────────────────────────────────────────────────────────

// ── Subscription tracking (leak prevention) ──────────────────────────────────

type StateChangeHandler = (state: VoiceAgentServiceState) => void;

// ── Browser-safe emitter | 浏览器安全事件分发器 ───────────────────────────────

type VoiceAgentServiceEventMap = {
  stateChange: [VoiceAgentServiceState];
};

class BrowserEventEmitter<
  Events extends Record<string, unknown[]>,
> {
  private readonly listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<EventName extends keyof Events>(eventName: EventName, listener: (...args: Events[EventName]) => void): void {
    const eventListeners = this.listeners.get(eventName) ?? new Set<(...args: unknown[]) => void>();
    eventListeners.add(listener as (...args: unknown[]) => void);
    this.listeners.set(eventName, eventListeners);
  }

  off<EventName extends keyof Events>(eventName: EventName, listener: (...args: Events[EventName]) => void): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners) return;
    eventListeners.delete(listener as (...args: unknown[]) => void);
    if (eventListeners.size === 0) this.listeners.delete(eventName);
  }

  emit<EventName extends keyof Events>(eventName: EventName, ...args: Events[EventName]): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners || eventListeners.size === 0) return;
    for (const listener of [...eventListeners]) {
      listener(...args);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export class VoiceAgentService extends BrowserEventEmitter<VoiceAgentServiceEventMap> {
  // ── State ────────────────────────────────────────────────────────────────

  private _listening = false;
  private _speechActive = false;
  private _mode: VoiceAgentMode = 'command';
  private _interimText = '';
  private _finalText = '';
  private _confidence = 0;
  private _lastIntent: VoiceIntent | null = null;
  private _error: string | null = null;
  private _safeMode = false;
  private _pendingConfirm: { actionId: ActionId; label: string; fromFuzzy?: boolean } | null = null;
  private _session: VoiceSession = createInitialSession();
  private _engine: SttEngine = 'web-speech';
  private _isRecording = false;
  private _commercialProviderKind: CommercialProviderKind = 'groq';
  private _commercialProviderConfig: CommercialProviderCreateConfig = {};
  private _energyLevel = 0;
  private _batteryLevel: number | undefined; // cached from Battery Status API
  private _recordingDuration = 0;
  private _wakeWordEnabled = false;
  private _wakeWordEnergyLevel = 0;
  private _detectedLang: string | null = null;
  private _agentState: VoiceAgentServiceState['agentState'] = 'idle';

  // ── Options ────────────────────────────────────────────────────────────────

  private readonly _corpusLang: string;
  private _langOverride: string | null;
  private readonly _whisperServerUrl: string;
  private readonly _whisperServerModel: string;
  private readonly _onExecuteAction: ((actionId: ActionId, params?: { segmentIndex?: number }) => void) | undefined;
  private readonly _onInsertDictation: ((text: string) => void) | undefined;
  private readonly _onSendToAiChat: ((text: string) => void) | undefined;
  private readonly _onToolCall: ((call: { name: string; arguments: Record<string, unknown> }) => Promise<{ ok: boolean; message: string }>) | undefined;
  private readonly _resolveIntentWithLlm: ((input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>) | undefined;

  // ── Internal refs ────────────────────────────────────────────────────────

  // ── Subscription registry (leak prevention) ─────────────────────────────
  private readonly _subscriptions = new Map<StateChangeHandler, (...args: unknown[]) => void>();

  private _voiceService: VoiceInputServiceType | null = null;
  private _wakeWordDetector: WakeWordDetectorType | null = null;
  private _recordingDurationInterval: ReturnType<typeof setInterval> | null = null;
  // ── Dictation pipeline (SpeechAnnotationPipeline) ───────────────────────
  private _dictationPipeline: SpeechAnnotationPipeline | null = null;

  // ── Environment & quality observers ─────────────────────────────────────
  private _ambientUnsubscribe: (() => void) | null = null;
  private _speechQuality: SpeechQualityAnalyzer | null = null;
  private _engineSwitchCounter = 0;
  private _intentAliasMap: Record<string, ActionId> = {};
  private _stateCache: VoiceAgentServiceState | null = null;
  private static readonly _ENGINE_SWITCH_THRESHOLD = 3; // require N consecutive recommendations before switching

  // ── UI context (set by page via setUiContext) ────────────────────────────
  private _currentSegmentId: string | null = null;
  private _selectedSegmentIds: string[] = [];
  private _currentPhase: string = 'transcribing';
  private _attentionHotspots: Array<{ segmentId: string; index: number; score: number }> = [];

  // 页面隐藏 / 关闭时持久化会话 | Persist session on page hide / close
  private readonly _handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden' && this._session.entries.length > 0) {
      void saveVoiceSession(this._session).catch((err) => { log.error('failed to persist session', { err }); });
    }
  };

  // ── Constructor ─────────────────────────────────────────────────────────

  constructor(options: VoiceAgentServiceOptions = {}) {
    super();
    const runtimeConfig = resolveVoiceAgentRuntimeConfig({
      ...(options.whisperServerUrl !== undefined && { whisperServerUrl: options.whisperServerUrl }),
      ...(options.whisperServerModel !== undefined && { whisperServerModel: options.whisperServerModel }),
      ...(options.commercialProviderKind !== undefined && { commercialProviderKind: options.commercialProviderKind }),
      ...(options.commercialProviderConfig !== undefined && { commercialProviderConfig: options.commercialProviderConfig }),
    });
    this._corpusLang = options.corpusLang ?? 'cmn';
    this._langOverride = options.langOverride ?? null;
    this._safeMode = options.initialSafeMode ?? false;
    this._wakeWordEnabled = options.initialWakeWordEnabled ?? false;
    this._whisperServerUrl = runtimeConfig.whisperServerUrl;
    this._whisperServerModel = runtimeConfig.whisperServerModel;
    this._commercialProviderKind = runtimeConfig.commercialProviderKind;
    this._commercialProviderConfig = runtimeConfig.commercialProviderConfig;
    this._intentAliasMap = loadVoiceIntentAliasMap();
    this._onExecuteAction = options.onExecuteAction;
    this._onInsertDictation = options.onInsertDictation;
    this._onSendToAiChat = options.onSendToAiChat;
    this._onToolCall = options.onToolCall;
    this._resolveIntentWithLlm = options.resolveIntentWithLlm;

    // Load most recent session from IndexedDB
    void loadRecentVoiceSessions(1).then(([recent]) => {
      if (recent && recent.entries.length > 0) {
        this._session = recent;
        this._emitStateChange();
      }
    }).catch((err) => { log.error('failed to restore session from IndexedDB', { err }); });

    // Start wake-word detector if enabled
    if (this._wakeWordEnabled) {
      this._startWakeWordDetector();
    }

    // Subscribe to ambient environment changes — adapt STT engine when offline
    this._ambientUnsubscribe = AmbientObserver.getInstance().onEnvironmentChange((env) => {
      if (!env.online && this._listening) {
        // Network offline: prefer local engines, switch away from commercial
        if (this._engine === 'commercial') {
          this.switchEngine('whisper-local');
        }
      }
    });

    // Initialize speech quality analyzer for adaptive STT engine recommendation
    this._speechQuality = SpeechQualityAnalyzer.getInstance();

    // 页面关闭 / 隐藏时保存会话 | Save session on page hide / close
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  // ── Public getters (read-only state) ───────────────────────────────────

  get state(): VoiceAgentServiceState {
    // Return cached state if already built by _emitStateChange; otherwise build once.
    // This prevents expensive _buildGroundingContext() from running on every .state access.
    if (this._stateCache) return this._stateCache;
    return {
      listening: this._listening,
      speechActive: this._speechActive,
      mode: this._mode,
      interimText: this._interimText,
      finalText: this._finalText,
      confidence: this._confidence,
      lastIntent: this._lastIntent,
      error: this._error,
      safeMode: this._safeMode,
      pendingConfirm: this._pendingConfirm,
      session: this._session,
      engine: this._engine,
      isRecording: this._isRecording,
      commercialProviderKind: this._commercialProviderKind,
      commercialProviderConfig: this._commercialProviderConfig,
      energyLevel: this._energyLevel,
      recordingDuration: this._recordingDuration,
      wakeWordEnabled: this._wakeWordEnabled,
      wakeWordEnergyLevel: this._wakeWordEnergyLevel,
      detectedLang: this._detectedLang,
      agentState: this._agentState,
      groundingContext: this._buildGroundingContext(),
    };
  }

  get listening() { return this._listening; }
  get mode() { return this._mode; }
  get agentState() { return this._agentState; }
  get lastIntent() { return this._lastIntent; }
  get pendingConfirm() { return this._pendingConfirm; }
  get session() { return this._session; }
  get error() { return this._error; }
  get wakeWordEnabled() { return this._wakeWordEnabled; }
  get safeMode() { return this._safeMode; }
  get engine() { return this._engine; }
  get detectedLang() { return this._detectedLang; }

  // ── State setters with event emission ───────────────────────────────────

  private _setState(partial: Partial<VoiceAgentServiceState>): void {
    // NOTE: Do NOT use Object.assign — it overwrites prototype getter/setter pairs
    // (listening, mode, interimText, finalText, confidence, error, lastIntent,
    // pendingConfirm, etc.) with plain own properties, breaking React state reactivity.
    if (partial.listening !== undefined) this._listening = partial.listening;
    if (partial.speechActive !== undefined) this._speechActive = partial.speechActive;
    if (partial.mode !== undefined) this._mode = partial.mode;
    if (partial.interimText !== undefined) this._interimText = partial.interimText;
    if (partial.finalText !== undefined) this._finalText = partial.finalText;
    if (partial.confidence !== undefined) this._confidence = partial.confidence;
    if (partial.lastIntent !== undefined) this._lastIntent = partial.lastIntent;
    if (partial.error !== undefined) this._error = partial.error;
    if (partial.safeMode !== undefined) this._safeMode = partial.safeMode;
    if (partial.pendingConfirm !== undefined) this._pendingConfirm = partial.pendingConfirm;
    if (partial.session !== undefined) this._session = partial.session;
    if (partial.engine !== undefined) this._engine = partial.engine;
    if (partial.isRecording !== undefined) this._isRecording = partial.isRecording;
    if (partial.commercialProviderKind !== undefined) this._commercialProviderKind = partial.commercialProviderKind;
    if (partial.commercialProviderConfig !== undefined) this._commercialProviderConfig = partial.commercialProviderConfig;
    if (partial.energyLevel !== undefined) this._energyLevel = partial.energyLevel;
    if (partial.recordingDuration !== undefined) this._recordingDuration = partial.recordingDuration;
    if (partial.wakeWordEnabled !== undefined) this._wakeWordEnabled = partial.wakeWordEnabled;
    if (partial.wakeWordEnergyLevel !== undefined) this._wakeWordEnergyLevel = partial.wakeWordEnergyLevel;
    if (partial.detectedLang !== undefined) this._detectedLang = partial.detectedLang;
    if (partial.agentState !== undefined) this._agentState = partial.agentState;
    // groundingContext is derived — read via _buildGroundingContext(), not assigned here
    this._emitStateChange();
  }

  private _emitStateChange(): void {
    // Build and cache the full state object to avoid repeated allocations
    // and expensive _buildGroundingContext() calls on every .state access.
    this._stateCache = {
      listening: this._listening,
      speechActive: this._speechActive,
      mode: this._mode,
      interimText: this._interimText,
      finalText: this._finalText,
      confidence: this._confidence,
      lastIntent: this._lastIntent,
      error: this._error,
      safeMode: this._safeMode,
      pendingConfirm: this._pendingConfirm,
      session: this._session,
      engine: this._engine,
      isRecording: this._isRecording,
      commercialProviderKind: this._commercialProviderKind,
      commercialProviderConfig: this._commercialProviderConfig,
      energyLevel: this._energyLevel,
      recordingDuration: this._recordingDuration,
      wakeWordEnabled: this._wakeWordEnabled,
      wakeWordEnergyLevel: this._wakeWordEnergyLevel,
      detectedLang: this._detectedLang,
      agentState: this._agentState,
      groundingContext: this._buildGroundingContext(),
    };
    this.emit('stateChange', this._stateCache);
  }

  /**
   * Subscribe to state changes.
   * Prefer this over raw `on('stateChange', ...)` — returns a cleanup function
   * that removes the exact same handler reference, preventing listener leaks.
   */
  onStateChange(handler: StateChangeHandler): () => void {
    const bound = (...args: unknown[]) => {
      const state = args[0] as VoiceAgentServiceState;
      handler(state);
    };
    this._subscriptions.set(handler, bound);
    this.on('stateChange', bound);
    return () => this.removeStateListener(handler);
  }

  /**
   * Remove a state change listener by its original handler reference.
   * No-op if the handler was never subscribed.
   */
  removeStateListener(handler: StateChangeHandler): void {
    const bound = this._subscriptions.get(handler);
    if (bound) {
      this.off('stateChange', bound);
      this._subscriptions.delete(handler);
    }
  }

  // ── VoiceInputService lifecycle ─────────────────────────────────────────

  private _getEffectiveLang(): string {
    const override = this._langOverride;
    if (override === '__auto__') return ''; // empty = browser auto-detect
    if (override) return toBcp47(override) ?? this._corpusLang;
    return toBcp47(this._corpusLang) ?? this._corpusLang;
  }

  /** Asynchronously refresh the cached battery level (fire-and-forget).
   * 异步更新电量缓存，下次 chooseSttEngine 时生效。 */
  private _refreshBatteryLevel(): void {
    if (typeof navigator === 'undefined' || !('getBattery' in navigator)) return;
    type BatteryManager = { level: number };
    (navigator as unknown as { getBattery(): Promise<BatteryManager> })
      .getBattery()
      .then((b) => { this._batteryLevel = b.level; })
      .catch((err) => { log.error('failed to get battery level', { err }); });
  }

  private async _ensureVoiceService(): Promise<VoiceInputServiceType> {
    if (!this._voiceService) {
      const { VoiceInputService } = await loadVoiceInputRuntime();
      this._voiceService = new VoiceInputService();
      this._voiceService.onResult((result) => this._handleSttResult(result));
      this._voiceService.onError((err) => {
        this._setState({ error: err, agentState: 'idle' });
        Earcon.playError();
      });
      this._voiceService.onStateChange((listening) => {
        this._setState({ listening, agentState: listening ? 'listening' : 'idle' });
      });
      if ('onVadStateChange' in this._voiceService && typeof this._voiceService.onVadStateChange === 'function') {
        (this._voiceService as VoiceInputServiceType & { onVadStateChange: (fn: (active: boolean) => void) => void }).onVadStateChange((active) => {
          this._setState({ speechActive: active });
        });
      }
      if ('onEnergyLevel' in this._voiceService && typeof this._voiceService.onEnergyLevel === 'function') {
        (this._voiceService as VoiceInputServiceType & { onEnergyLevel: (fn: (rms: number) => void) => void }).onEnergyLevel((rms) => {
          this._setState({ energyLevel: rms });
        });
      }
    }

    return this._voiceService;
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────

  async start(targetMode?: VoiceAgentMode): Promise<void> {
    if (this._listening) return;

    if (targetMode) this._setState({ mode: targetMode });
    this._setState({ error: null, pendingConfirm: null, agentState: 'listening' });
    this._session = createInitialSession();

    const svc = await this._ensureVoiceService();
    const lang = this._getEffectiveLang();

    // Refresh battery level for next call; use cached value now | 异步刷新电量，当前用缓存值
    this._refreshBatteryLevel();
    const region = await detectRegion();
    const { chooseSttEngine } = await loadSttStrategyRuntime();
    const runtimeEngine = chooseSttEngine({
      preferred: this._engine,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      noiseLevel: this._energyLevel,
      ...(this._batteryLevel !== undefined && { batteryLevel: this._batteryLevel }),
      regionHint: region,
    });

    const startConfig: Parameters<typeof svc.start>[0] = {
      lang,
      continuous: true,
      interimResults: true,
      preferredEngine: runtimeEngine,
      region,
      maxAlternatives: 3,
    };
    // whisper-local 使用 whisper-server（3040 端口） | whisper-local uses whisper-server (port 3040)
    if (runtimeEngine === 'whisper-local') {
      log.debug('start whisper config', { url: this._whisperServerUrl, model: this._whisperServerModel });
      startConfig.whisperServerUrl = this._whisperServerUrl;
      startConfig.whisperServerModel = this._whisperServerModel;
    }
    if (runtimeEngine === 'commercial' && this._commercialProviderConfig) {
      const { createCommercialProvider } = await loadSttRuntime();
      startConfig.commercialFallback = createCommercialProvider(
        this._commercialProviderKind,
        this._commercialProviderConfig,
      );
    }
    try {
      await svc.start(startConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : '语音服务启动失败 | Failed to start voice service';
      this._setState({
        listening: false,
        speechActive: false,
        error: message,
        agentState: 'idle',
      });
      Earcon.playError();
      return;
    }

    // Start speech quality analyzer after the voice service has a live MediaStream.
    // This must happen AFTER svc.start() so that createAnalysisCloneStream()
    // can successfully clone the shared microphone stream.
    if (this._speechQuality && !this._speechQuality.isActive) {
      const stream = await this._voiceService!.createAnalysisCloneStream();
      if (stream) {
        this._speechQuality.start(stream);
      } else {
        // Fallback: let SpeechQualityAnalyzer request its own getUserMedia.
        // This may prompt the browser for microphone permission a second time.
        void this._speechQuality.start();
      }
    }

    void unlockAudio();
    Earcon.playActivate();
  }

  stop(): void {
    this._speechQuality?.stop();
    this._voiceService?.releaseSharedAnalysisStream();
    this._voiceService?.stop();
    this._setState({
      listening: false,
      speechActive: false,
      interimText: '',
      pendingConfirm: null,
      agentState: 'idle',
    });

    if (this._session.entries.length > 0) {
      void saveVoiceSession(this._session).catch((err) => { log.error('failed to persist session on deactivate', { err }); });
    }

    Earcon.playDeactivate();
  }

  async toggle(targetMode?: VoiceAgentMode): Promise<void> {
    if (this._listening) {
      this.stop();
    } else {
      await this.start(targetMode);
    }
  }

  // ── Dictation pipeline (Stage 4 — SpeechAnnotationPipeline) ─────────────

  /**
   * Start the SpeechAnnotationPipeline — continuous dictation → auto-fill → auto-advance.
   *
   * This method wires the pipeline to the VoiceInputService STT stream so that every
   * final transcript is automatically routed to `onSttResult()`.
   *
   * @param callbacks  Segment management callbacks from the page (getSegments, fillSegment, navigateTo, …)
   * @param config     Optional pipeline configuration (autoAdvance, silenceConfirmDelayMs, …)
   */
  startDictationPipeline(callbacks: DictationPipelineCallbacks, config?: QuickDictationConfig): void {
    if (this._dictationPipeline) {
      this._dictationPipeline.stop();
    }

    this._dictationPipeline = new SpeechAnnotationPipeline(callbacks, {
      ...config,
      autoAdvance: config?.autoAdvance ?? true,
      silenceConfirmDelayMs: config?.silenceConfirmDelayMs ?? 600,
      maxUtteranceDurationSec: config?.maxUtteranceDurationSec ?? 60,
      skipAlreadyAnnotated: config?.skipAlreadyAnnotated ?? true,
    });

    this._dictationPipeline.start();

    // Subscribe to pipeline state changes and reflect agentState
    // (SpeechAnnotationPipeline does not expose a public state-change event,
    // so we drive the pipeline by feeding it from VoiceInputService)
  }

  /**
   * Feed an STT result into the active dictation pipeline.
   * Call this from the page's VoiceInputService `onResult` handler.
   */
  feedDictationSttResult(result: SttResult): void {
    this._dictationPipeline?.onSttResult(result);
  }

  /**
   * Get the current dictation pipeline state.
   */
  getDictationState() {
    return this._dictationPipeline?.state ?? null;
  }

  /**
   * Skip the current segment and advance to the next unannotated one.
   */
  skipDictationSegment(): void {
    this._dictationPipeline?.skipCurrent();
  }

  /**
   * Undo the last dictation fill.
   */
  async undoDictationFill(): Promise<void> {
    await this._dictationPipeline?.undoLast();
  }

  /**
   * Stop the dictation pipeline.
   */
  stopDictationPipeline(): void {
    this._dictationPipeline?.stop();
    this._dictationPipeline = null;
  }

  // ── Push-to-talk ────────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    const svc = await this._ensureVoiceService();
    this._setState({ agentState: 'listening' });
    try {
      await svc.startRecording();
      this._setState({ isRecording: true, recordingDuration: 0 });
      this._recordingDurationInterval = setInterval(() => {
        this._setState({ recordingDuration: this._recordingDuration + 1 });
      }, 1000);
    } catch (error) {
      if (this._recordingDurationInterval !== null) {
        clearInterval(this._recordingDurationInterval);
        this._recordingDurationInterval = null;
      }
      this._setState({ isRecording: false, agentState: 'idle', error: error instanceof Error ? error.message : '录音启动失败' });
      Earcon.playError();
    }
  }

  async stopRecording(): Promise<void> {
    if (this._recordingDurationInterval !== null) {
      clearInterval(this._recordingDurationInterval);
      this._recordingDurationInterval = null;
    }
    this._setState({ isRecording: false, agentState: 'idle' });
    await this._voiceService?.stopRecording();
  }

  // ── Engine & config ────────────────────────────────────────────────────

  switchEngine(newEngine: SttEngine): void {
    this._engineSwitchCounter = 0;
    this._setState({ engine: newEngine });
    // 持久化引擎偏好 | Persist engine preference
    globalContext.updatePreference('preferredEngine', newEngine);
    if (this._listening) {
      // When switching to whisper-local, we need to pass the config again
      if (newEngine === 'whisper-local') {
        this._voiceService?.switchEngine(newEngine, {
          whisperServerUrl: this._whisperServerUrl,
          whisperServerModel: this._whisperServerModel,
        });
      } else {
        this._voiceService?.switchEngine(newEngine);
      }
    }
  }

  setCommercialProviderKind(kind: CommercialProviderKind): void {
    this._commercialProviderKind = kind;
    this._emitStateChange();
  }

  setCommercialProviderConfig(config: CommercialProviderCreateConfig): void {
    this._commercialProviderConfig = config;
    this._emitStateChange();
  }

  async testCommercialProvider(): Promise<{ available: boolean; error?: string }> {
    const { testCommercialProvider } = await loadSttRuntime();
    return testCommercialProvider(this._commercialProviderKind, this._commercialProviderConfig);
  }

  // ── Mode & safe mode ───────────────────────────────────────────────────

  switchMode(newMode: VoiceAgentMode): void {
    this._setState({ mode: newMode, pendingConfirm: null, interimText: '' });
  }

  setSafeMode(on: boolean): void {
    this._setState({ safeMode: on });
  }

  setWakeWordEnabled(on: boolean): void {
    this._wakeWordEnabled = on;
    if (on) {
      this._startWakeWordDetector();
    } else {
      this._stopWakeWordDetector();
    }
    this._emitStateChange();
  }

  setLangOverride(lang: string | null): void {
    this._langOverride = lang;
    // 同步更新正在运行的 VoiceInputService | Sync to running VoiceInputService
    if (this._voiceService && lang) {
      const bcp47 = lang === '__auto__' ? '' : (toBcp47(lang) ?? lang);
      this._voiceService.setLang(bcp47);
    }
    this._emitStateChange();
  }

  // ── Confirmation ──────────────────────────────────────────────────────

  confirmPending(): void {
    if (!this._pendingConfirm) return;
    const actionId = this._pendingConfirm.actionId;
    this._setState({ pendingConfirm: null, agentState: 'executing' });
    this._onExecuteAction?.(actionId);
    Earcon.playSuccess();
    // Record action
    globalContext.markSessionStart();
    userBehaviorStore.recordAction({ actionId, durationMs: 0, sessionId: this._session.id });
    this._setState({ agentState: 'idle' });
  }

  cancelPending(): void {
    this._setState({ pendingConfirm: null });
    Earcon.playTick();
  }

  // ── STT Result Handler ─────────────────────────────────────────────────

  private async _handleSttResult(result: SttResult): Promise<void> {
    if (result.lang) {
      this._setState({ detectedLang: result.lang });
    }

    if (!result.isFinal) {
      this._setState({ interimText: result.text, confidence: result.confidence });
      return;
    }

    // Dictation pipeline routing — when active, feed results to the pipeline
    // instead of intent routing. The pipeline handles confirmation/navigation.
    if (this._dictationPipeline) {
      this._setState({ interimText: '', finalText: result.text, confidence: result.confidence });
      this._dictationPipeline.onSttResult(result);
      this._speechQuality?.recordSegmentQuality('dictation');
      void this._checkAndSwitchEngineIfNeeded();
      return;
    }

    // Record audio quality for command-mode segments
    this._speechQuality?.recordSegmentQuality('command');

    // Detect and record term/phrase patterns from natural language
    this._detectAndRecordMemoryPattern(result.text);

    this._setState({ interimText: '', finalText: result.text, confidence: result.confidence, agentState: 'routing' });

    let intent = routeIntent(result.text, this._mode, {
      sttConfidence: result.confidence,
      detectedLang: result.lang,
      aliasMap: this._intentAliasMap,
    });
    log.debug('routeIntent', { text: result.text, mode: this._mode, intentType: intent.type });

    // LLM fallback for chat intents
    let llmFallbackFailed = false;
    let llmResolvedAction = false;
    if (intent.type === 'chat' && this._mode === 'command' && this._resolveIntentWithLlm) {
      try {
        const fallbackIntent = await this._resolveIntentWithLlm({
          text: result.text,
          mode: this._mode,
          session: this._session,
        });
        if (fallbackIntent) {
          intent = refineLlmFallbackIntent(fallbackIntent, result);
          llmResolvedAction = intent.type === 'action';
        } else {
          llmFallbackFailed = true;
          this._setState({ error: '无法识别该指令，请重试或切换到"分析"模式直接发送文本' });
        }
      } catch (err) {
        llmFallbackFailed = true;
        this._setState({ error: err instanceof Error ? err.message : 'LLM intent解析失败' });
      }
    }

    if (llmResolvedAction && intent.type === 'action') {
      const learned = learnVoiceIntentAlias(result.text, intent.actionId);
      if (learned.applied) {
        this._intentAliasMap = learned.aliasMap;
      }
    }
    // Bump usage stats for alias-matched intents | 命中别名时更新使用统计
    if (!llmResolvedAction && intent.type === 'action' && intent.fromAlias) {
      bumpAliasUsage(result.text);
    }

    this._setState({ lastIntent: intent, agentState: llmFallbackFailed ? 'idle' : 'executing' });

    // Record to session
    const entry: VoiceSessionEntry = {
      timestamp: Date.now(),
      intent,
      sttText: result.text,
      confidence: result.confidence,
    };
    this._session = { ...this._session, entries: [...this._session.entries, entry] };
    this._emitStateChange();

    // Dispatch by intent type
    switch (intent.type) {
      case 'action': {
        const needsConfirm =
          (intent.fromFuzzy && shouldConfirmFuzzyAction(intent.actionId))
          || (this._safeMode && isDestructiveAction(intent.actionId));
        if (needsConfirm) {
          const label = intent.fromFuzzy
            ? `[模糊] ${getActionLabel(intent.actionId)}`
            : getActionLabel(intent.actionId);
          this._setState({ pendingConfirm: { actionId: intent.actionId, label, ...(intent.fromFuzzy !== undefined && { fromFuzzy: intent.fromFuzzy }) }, agentState: 'idle' });
          Earcon.playTick();
        } else {
          this._onExecuteAction?.(intent.actionId, intent.params);
          Earcon.playSuccess();
          globalContext.markSessionStart();
          userBehaviorStore.recordAction({ actionId: intent.actionId, durationMs: 0, sessionId: this._session.id });
          this._setState({ agentState: 'idle' });
        }
        break;
      }
      case 'tool': {
        if (this._onToolCall) {
          try {
            const toolResult = await this._onToolCall({ name: intent.toolName, arguments: intent.params });
            if (toolResult.ok) {
              this._onSendToAiChat?.(`[工具执行] ${intent.toolName}：${toolResult.message}`);
              Earcon.playSuccess();
            } else {
              this._onSendToAiChat?.(`[工具失败] ${intent.toolName}：${toolResult.message}`);
              Earcon.playError();
            }
          } catch (err) {
            this._onSendToAiChat?.(`[工具异常] ${intent.toolName}：${err instanceof Error ? err.message : String(err)}`);
            Earcon.playError();
          }
        } else {
          this._onSendToAiChat?.(`[语音指令] ${intent.raw}`);
          Earcon.playSuccess();
        }
        this._setState({ agentState: 'idle' });
        break;
      }
      case 'dictation': {
        this._onInsertDictation?.(intent.text ?? result.text);
        break;
      }
      case 'slot-fill': {
        this._onSendToAiChat?.(`[槽位填充] ${intent.slotName}: ${intent.value}`);
        this._setState({ agentState: 'idle' });
        break;
      }
      case 'chat': {
        if (llmFallbackFailed) break;
        this._onSendToAiChat?.(intent.text ?? result.text);
        this._setState({ agentState: 'idle' });
        break;
      }
    }
  }

  // ── Wake-word detector ─────────────────────────────────────────────────

  private _startWakeWordDetector(): void {
    if (this._wakeWordDetector) return;
    void (async () => {
      try {
        const { WakeWordDetector } = await loadWakeWordRuntime();
        if (this._wakeWordDetector) return;
        const detector = new WakeWordDetector({
          energyThreshold: 0.05,
          speechMs: 400,
          cooldownMs: 3000,
          onWake: () => {
            void this.start('command');
          },
          onEnergy: (rms) => {
            this._setState({ wakeWordEnergyLevel: rms });
          },
        });
        this._wakeWordDetector = detector;
        detector.start().catch(() => {
          // Mic unavailable — silently disable
          this._wakeWordEnabled = false;
          this._emitStateChange();
        });
      } catch (err) {
        log.warn('wake-word detector setup failed, disabling', { err });
        this._wakeWordEnabled = false;
        this._emitStateChange();
      }
    })();
  }

  private _stopWakeWordDetector(): void {
    this._wakeWordDetector?.stop();
    this._wakeWordDetector = null;
  }

  /**
   * Detect natural-language memory patterns in the transcript and record them
   * to ProjectMemoryStore. Currently detects:
   * - Term confirmation: "记住这个词" / "这是术语" / "添加术语"
   * - Phrase recording: "记住这个表达" / "常见说法是" / "固定说法"
   */
  private _detectAndRecordMemoryPattern(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 4) return;

    const LOWER = trimmed.toLowerCase();

    // Term confirmation: "记住这个词" / "记住这个术语" / "添加术语"
    if (LOWER.includes('记住这个词') || LOWER.includes('记住这个术语') || LOWER.includes('添加术语')) {
      // Try to extract term and gloss from the full transcript
      // e.g. "记住了，'坚持'的意思是..." or "'坚持'的意思是..."
      const termMatch = trimmed.match(/['"»‘’"](.+?)['"»‘’"]/);
      if (termMatch) {
        const term = termMatch[1];
        // Use the full sentence as the gloss approximation
        const gloss = trimmed.replace(/记得.*?[，,]?/, '').replace(/记住.*?[，,]?/, '').trim();
        if (term && gloss && term !== gloss) {
          void projectMemoryStore.confirmTerm(term, gloss.slice(0, 200), this._corpusLang);
        }
      }
    }

    // Phrase recording: "记住这个表达" / "常见说法是" / "固定说法"
    if (LOWER.includes('记住这个表达') || LOWER.includes('常见说法是') || LOWER.includes('固定说法')) {
      const phraseMatch = trimmed.match(/['"»‘’"](.+?)['"»‘’"]/);
      if (phraseMatch) {
        const phrase = phraseMatch[1];
        const translation = trimmed.replace(/记住.*?[，,]?/, '').replace(/常见.*?[，,]?/, '').replace(/固定.*?[，,]?/, '').trim();
        if (phrase && translation && phrase !== translation) {
          void projectMemoryStore.recordPhrase(phrase, translation.slice(0, 200), 'voice-confirmed');
        }
      }
    }
  }

  /**
   * Check if audio quality recommends a different STT engine and switch
   * if the recommendation is consistent (hysteresis to avoid flapping).
   * Called asynchronously after each final STT result.
   */
  private _checkAndSwitchEngineIfNeeded(): void {
    const sq = this._speechQuality;
    if (!sq || !this._listening) return;

    const recommended = sq.recommendSttEngine();
    // Map 'whisper-local' | 'commercial' | 'web-speech' → 'whisper-local' | 'commercial' | 'web-speech'
    const targetEngine: SttEngine = recommended;

    if (targetEngine === this._engine) {
      // Already using the recommended engine — reset counter
      this._engineSwitchCounter = 0;
      return;
    }

    this._engineSwitchCounter += 1;
    if (this._engineSwitchCounter >= VoiceAgentService._ENGINE_SWITCH_THRESHOLD) {
      this.switchEngine(targetEngine);
      this._engineSwitchCounter = 0;
    }
  }

  // ── Grounding Context (Stage 2) ─────────────────────────────────────────

  /**
   * Update UI-layer context used for building grounding context.
   * Call this whenever the active segment or selection changes.
   */
  setUiContext(context: {
    currentSegmentId?: string | null;
    selectedSegmentIds?: string[];
    currentPhase?: string;
    attentionHotspots?: Array<{ segmentId: string; index: number; score: number }>;
  }): void {
    if (context.currentSegmentId !== undefined) this._currentSegmentId = context.currentSegmentId ?? null;
    if (context.selectedSegmentIds !== undefined) this._selectedSegmentIds = context.selectedSegmentIds;
    if (context.currentPhase !== undefined) this._currentPhase = context.currentPhase;
    if (context.attentionHotspots !== undefined) this._attentionHotspots = context.attentionHotspots;
    this._emitStateChange();
  }

  private _buildGroundingContext(): GroundingContextData {
    const corpus = globalContext.getCorpusContext();
    const profile = globalContext.getBehaviorProfile();

    // Find current segment
    let currentSegment: GroundingContextData['currentSegment'] = null;
    if (this._currentSegmentId && corpus) {
      const seg = corpus.segments.find((s) => s.id === this._currentSegmentId);
      if (seg) {
        const segIndex = corpus.segments.indexOf(seg) + 1;
        const duration = seg.audioTimeRange ? seg.audioTimeRange[1] - seg.audioTimeRange[0] : 0;
        currentSegment = {
          id: seg.id,
          index: segIndex,
          text: seg.text,
          translation: seg.translation,
          gloss: seg.glossTiers ? Object.values(seg.glossTiers).join(' / ') : null,
          isMarked: false,
          durationSeconds: duration,
        };
      }
    }

    // Compute most used action
    let mostUsedAction: string | null = null;
    if (profile.actionFrequencies) {
      const entries = Object.entries(profile.actionFrequencies);
      if (entries.length > 0) {
        entries.sort((a, b) => b[1] - a[1]);
        const topEntry = entries[0];
        if (topEntry) mostUsedAction = getActionLabel(topEntry[0] as ActionId);
      }
    }

    // Map confirmation threshold (normalize 'destructive' → 'destructive-only')
    const rawThreshold = profile.preferences?.confirmationThreshold;
    const confirmationPreference: GroundingContextData['userProfile']['confirmationPreference'] =
      rawThreshold === 'always' ? 'always' :
      rawThreshold === 'never' ? 'never' :
      'destructive-only';

    // Build user profile section
    const userProfile: GroundingContextData['userProfile'] = {
      preferredMode: profile.preferences?.preferredMode ?? 'command',
      mostUsedAction,
      fatigueScore: profile.fatigue?.score ?? 0,
      confirmationPreference,
    };

    // Relevant corpus: search for current segment text if available
    let relevantCorpus: GroundingContextData['relevantCorpus'] = [];
    if (currentSegment && corpus) {
      // Find similar segments (simple keyword overlap for now)
      const keywords = currentSegment.text.split(/\s+/).filter((w) => w.length > 2);
      relevantCorpus = corpus.segments
        .filter((s) => s.id !== currentSegment!.id && keywords.some((kw) => s.text.includes(kw)))
        .slice(0, 5)
        .map((s) => ({
          segmentId: s.id,
          text: s.text,
          translation: s.translation,
          score: keywords.filter((kw) => s.text.includes(kw)).length / keywords.length,
          source: s.translation ? 'translation' : 'transcription',
        }));
    }

    // AI adoption rate: compute from recent session
    let aiAdoptionRate: number | null = null;
    const recentEntries = this._session.entries.slice(-20);
    const aiActions = recentEntries.filter((e) => e.intent.type === 'chat' || e.intent.type === 'tool');
    if (aiActions.length > 0) {
      aiAdoptionRate = aiActions.length / Math.max(recentEntries.length, 1);
    }

    return {
      currentSegment,
      selectedSegmentIds: this._selectedSegmentIds,
      totalSegments: corpus?.segments.length ?? 0,
      userProfile,
      currentPhase: this._currentPhase,
      attentionHotspots: this._attentionHotspots,
      relevantCorpus,
      aiAdoptionRate,
      contextBuiltAt: Date.now(),
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  dispose(): void {
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    this._ambientUnsubscribe?.();
    AmbientObserver.getInstance().stop(); // Release all ambient listeners
    this._voiceService?.dispose();
    this._voiceService?.releaseSharedAnalysisStream();
    this._voiceService = null;
    this._speechQuality?.stop();
    this._stopWakeWordDetector();
    if (this._recordingDurationInterval !== null) {
      clearInterval(this._recordingDurationInterval);
      this._recordingDurationInterval = null;
    }
    // Remove all tracked subscriptions cleanly
    for (const handler of this._subscriptions.keys()) {
      this.removeStateListener(handler);
    }
    this._subscriptions.clear();
    this.removeAllListeners();
  }

  // ── Session ────────────────────────────────────────────────────────────

  getSession(): VoiceSession {
    return this._session;
  }
}

// ── Singleton export ────────────────────────────────────────────────────────

let _instance: VoiceAgentService | null = null;

export function getVoiceAgentService(): VoiceAgentService | null {
  return _instance;
}

export function createVoiceAgentService(options: VoiceAgentServiceOptions = {}): VoiceAgentService {
  if (_instance) {
    _instance.dispose();
  }
  _instance = new VoiceAgentService(options);
  return _instance;
}
