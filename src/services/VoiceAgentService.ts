/**
 * VoiceAgentService — \u8bed\u97f3\u667a\u80fd\u4f53\u4e1a\u52a1\u903b\u8f91\u7c7b（\u975e React）
 *
 * \u4ece useVoiceAgent hook \u4e2d\u63d0\u53d6\u7684\u6838\u5fc3\u903b\u8f91，\u4f5c\u4e3a\u5355\u4f8b service \u66b4\u9732\u7ed9\u6240\u6709\u9875\u9762。
 *
 * \u8bbe\u8ba1\u539f\u5219：
 * - \u4e0d\u4f9d\u8d56 React，\u4e0d\u4f7f\u7528 useState/useEffect/useCallback
 * - \u6240\u6709\u72b6\u6001\u901a\u8fc7\u4e8b\u4ef6\u6d3e\u53d1，\u5916\u90e8\u901a\u8fc7\u8ba2\u9605\u673a\u5236\u83b7\u53d6
 * - \u4e0e useVoiceAgent hook \u5171\u4eab\u5b9e\u73b0，\u4fdd\u6301\u5411\u540e\u517c\u5bb9
 * - ADR-0028\uff1a\u751f\u4ea7\u754c\u9762\u4ee5 useVoiceAgent \u4e3a\u4e3b\u8def\u5f84\uff1bcommandBridge \u4e0e hook \u5171\u7528 assistantVoiceIntentDispatch\uff08\u542b appendTurnToVoiceSession\uff09\u4ee5\u7edf\u4e00\u56de\u5408\u8bb0\u5f55\u4e0e\u5206\u53d1\u3002
 *
 * @see \u89e3\u8bed\u8bed\u97f3\u667a\u80fd\u4f53\u67b6\u6784\u8bbe\u8ba1\u65b9\u6848 v2.5 §\u9636\u6bb51
 */

import type { VoiceInputService as VoiceInputServiceType } from './VoiceInputService';
import type { CommercialProviderKind, SttEngine, SttResult } from './VoiceInputService.types';
import type { WakeWordDetector as WakeWordDetectorType } from './WakeWordDetector';
import { SpeechQualityAnalyzer } from './SpeechQualityAnalyzer';
import { saveVoiceSession, loadRecentVoiceSessions } from './VoiceSessionStore';
import type { QuickDictationConfig, DictationPipelineCallbacks } from './SpeechAnnotationPipeline';
import {
  createVoiceSession,
  loadVoiceIntentAliasMap,
  type ActionId,
  type VoiceIntent,
  type VoiceSession,
} from './IntentRouter';
import type { CommercialProviderCreateConfig } from './stt';
import { resolveVoiceAgentRuntimeConfig } from './config/voiceAgentRuntimeConfig';
import * as Earcon from './EarconService';
import { unlockAudio } from './EarconService';
import {
  type GroundingContextData,
  type VoiceAgentGroundingUiContext,
} from './VoiceAgentGroundingContext';
import { createLogger } from '../observability/logger';
import { BrowserEventEmitter } from './VoiceAgentService.eventEmitter';
import { dispatchVoiceAgentServiceSttResult } from './VoiceAgentService.sttResultDispatch';
import { runVoiceAgentServiceSttResultFlow } from './VoiceAgentService.sttResultFlow';
import { VoiceAgentDictationController } from './VoiceAgentDictationController';
import { buildVoiceAgentServiceStateSnapshot } from './VoiceAgentService.state';
import { testVoiceAgentCommercialProvider } from './VoiceAgentService.runtime';
import {
  startVoiceAgentRecording,
  stopVoiceAgentRecording,
} from './VoiceAgentService.recordingControls';
import { scheduleSyncVoiceServiceSttEnhancement } from './VoiceAgentService.sttEnhancementSync';
import { applyAdaptiveSttEngineRecommendation } from './VoiceAgentService.adaptiveEngineSwitch';
import { runVoiceAgentExclusiveStart } from './VoiceAgentService.startFlow';
import {
  cancelVoiceAgentExclusiveStart,
  restoreVoiceAgentRecentSession,
  runVoiceAgentDisposeFlow,
  runVoiceAgentStopFlow,
} from './VoiceAgentService.lifecycle';
import { ensureVoiceAgentServiceBoundInstance } from './VoiceAgentService.voiceServiceLifecycle';
import {
  applyVoiceAgentLangOverrideControl,
  cancelVoiceAgentPendingAction,
  confirmVoiceAgentPendingAction,
  switchVoiceAgentEngineControl,
} from './VoiceAgentService.controlPlane';
import {
  startVoiceAgentWakeWordLifecycle,
  stopVoiceAgentWakeWordLifecycle,
} from './VoiceAgentService.wakeWordLifecycle';
import {
  applyVoiceAgentGroundingUiContext,
  buildVoiceAgentServiceGroundingContext,
} from './VoiceAgentService.grounding';
import {
  buildVoiceAgentDictationControllerOptions,
  buildVoiceAgentRuntimeConfigInput,
  subscribeVoiceAgentAmbientEnvironment,
} from './VoiceAgentService.constructorSetup';
import type { Locale } from '../i18n';
import type {
  VoiceAgentMode,
  VoiceAgentServiceOptions,
  VoiceAgentServiceState,
} from './VoiceAgentService.types';
export type {
  VoiceAgentMode,
  VoiceAgentServiceOptions,
  VoiceAgentServiceState,
} from './VoiceAgentService.types';
import { loadSttRuntime, loadVoiceInputRuntime } from './voiceRuntimeLoaders';

const log = createLogger('VoiceAgentService');

// ── Types ────────────────────────────────────────────────────────────────────

export type { GroundingContextData } from './VoiceAgentGroundingContext';

// ── Defaults ────────────────────────────────────────────────────────────────

function createInitialSession(): VoiceSession {
  return createVoiceSession();
}

// ── VoiceAgentService ────────────────────────────────────────────────────────

// ── Subscription tracking (leak prevention) ──────────────────────────────────

type StateChangeHandler = (state: VoiceAgentServiceState) => void;

// ── Browser-safe emitter | \u6d4f\u89c8\u5668\u5b89\u5168\u4e8b\u4ef6\u5206\u53d1\u5668 ───────────────────────────────

type VoiceAgentServiceEventMap = {
  stateChange: [VoiceAgentServiceState];
};

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
  private _pendingConfirm: {
    actionId: ActionId;
    label: string;
    fromFuzzy?: boolean;
    params?: { segmentIndex?: number };
  } | null = null;
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
  private _locale: Locale;
  private readonly _whisperServerUrl: string;
  private readonly _whisperServerModel: string;
  private _sttEnhancementKind: import('./stt').SttEnhancementSelectionKind;
  private _sttEnhancementConfig: import('./stt').SttEnhancementConfig;
  private readonly _onExecuteAction:
    | ((actionId: ActionId, params?: { segmentIndex?: number }) => void)
    | undefined;
  private readonly _onInsertDictation: ((text: string) => void) | undefined;

  private readonly _onSendToAiChat: ((text: string) => void) | undefined;
  private readonly _onToolCall:
    | ((call: {
        name: string;
        arguments: Record<string, unknown>;
      }) => Promise<{ ok: boolean; message: string }>)
    | undefined;
  private readonly _resolveIntentWithLlm:
    | ((input: {
        text: string;
        mode: VoiceAgentMode;
        session: VoiceSession;
      }) => Promise<VoiceIntent | null>)
    | undefined;

  // ── Internal refs ────────────────────────────────────────────────────────

  // ── Subscription registry (leak prevention) ─────────────────────────────
  private readonly _subscriptions = new Map<StateChangeHandler, (...args: unknown[]) => void>();

  private _voiceService: VoiceInputServiceType | null = null;
  private _wakeWordDetector: WakeWordDetectorType | null = null;
  private _recordingDurationInterval: ReturnType<typeof setInterval> | null = null;
  // ── Dictation pipeline (SpeechAnnotationPipeline) ───────────────────────
  private readonly _dictationController: VoiceAgentDictationController;

  // ── Environment & quality observers ─────────────────────────────────────
  private _ambientUnsubscribe: (() => void) | null = null;
  private _speechQuality: SpeechQualityAnalyzer | null = null;
  private _engineSwitchCounter = 0;
  private _intentAliasMap: Record<string, ActionId> = {};
  private _stateCache: VoiceAgentServiceState | null = null;
  /** Bumped on each `stop()` and at the start of each `start()`; in-flight start tails compare to drop stale work after rapid toggle-off. */
  private _voiceActivateToken = 0;
  /** Coalesces concurrent `start()` calls; cleared in `stop()` so a new start is not blocked on a stale in-flight promise (CRITICAL-3). */
  private _exclusiveStartPromise: Promise<void> | null = null;

  // ── UI context (set by page via setUiContext) ────────────────────────────
  private _currentSegmentId: string | null = null;
  private _selectedSegmentIds: string[] = [];
  private _currentPhase: string = 'transcribing';
  private _attentionHotspots: Array<{ segmentId: string; index: number; score: number }> = [];

  // \u9875\u9762\u9690\u85cf / \u5173\u95ed\u65f6\u6301\u4e45\u5316\u4f1a\u8bdd | Persist session on page hide / close
  private readonly _handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden' && this._session.entries.length > 0) {
      void saveVoiceSession(this._session).catch((err) => {
        log.error('failed to persist session', { err });
      });
    }
  };

  // ── Constructor ─────────────────────────────────────────────────────────

  constructor(options: VoiceAgentServiceOptions = {}) {
    super();
    const runtimeConfig = resolveVoiceAgentRuntimeConfig(
      buildVoiceAgentRuntimeConfigInput(options),
    );
    this._corpusLang = options.corpusLang ?? 'cmn';
    this._langOverride = options.langOverride ?? null;
    this._locale = options.locale ?? 'zh-CN';
    this._safeMode = options.initialSafeMode ?? false;
    this._wakeWordEnabled = options.initialWakeWordEnabled ?? false;
    this._whisperServerUrl = runtimeConfig.whisperServerUrl;
    this._whisperServerModel = runtimeConfig.whisperServerModel;
    this._commercialProviderKind = runtimeConfig.commercialProviderKind;
    this._commercialProviderConfig = runtimeConfig.commercialProviderConfig;
    this._sttEnhancementKind = runtimeConfig.sttEnhancementKind;
    this._sttEnhancementConfig = runtimeConfig.sttEnhancementConfig;
    this._intentAliasMap = loadVoiceIntentAliasMap();
    this._onExecuteAction = options.onExecuteAction;
    this._onInsertDictation = options.onInsertDictation;
    this._dictationController = new VoiceAgentDictationController(
      buildVoiceAgentDictationControllerOptions(options),
    );
    this._onSendToAiChat = options.onSendToAiChat;
    this._onToolCall = options.onToolCall;
    this._resolveIntentWithLlm = options.resolveIntentWithLlm;

    // Load most recent session from IndexedDB
    restoreVoiceAgentRecentSession({
      loadRecentVoiceSessions,
      onSessionRestored: (session) => {
        this._session = session;
        this._emitStateChange();
      },
      onRestoreError: (err) => {
        log.error('failed to restore session from IndexedDB', { err });
      },
    });

    // Start wake-word detector if enabled
    if (this._wakeWordEnabled) {
      this._startWakeWordDetector();
    }

    // Subscribe to ambient environment changes — adapt STT engine when offline
    this._ambientUnsubscribe = subscribeVoiceAgentAmbientEnvironment({
      isListening: () => this._listening,
      getEngine: () => this._engine,
      switchEngine: (engine) => this.switchEngine(engine),
    });

    // Initialize speech quality analyzer for adaptive STT engine recommendation
    this._speechQuality = SpeechQualityAnalyzer.getInstance();

    // \u9875\u9762\u5173\u95ed / \u9690\u85cf\u65f6\u4fdd\u5b58\u4f1a\u8bdd | Save session on page hide / close
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  // ── Public getters (read-only state) ───────────────────────────────────

  private _buildStateSnapshot(): VoiceAgentServiceState {
    return buildVoiceAgentServiceStateSnapshot({
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
      sttEnhancementKind: this._sttEnhancementKind,
      sttEnhancementConfig: this._sttEnhancementConfig,
      energyLevel: this._energyLevel,
      recordingDuration: this._recordingDuration,
      wakeWordEnabled: this._wakeWordEnabled,
      wakeWordEnergyLevel: this._wakeWordEnergyLevel,
      detectedLang: this._detectedLang,
      agentState: this._agentState,
      groundingContext: this._buildGroundingContext(),
    });
  }

  get state(): VoiceAgentServiceState {
    // Return cached state if already built by _emitStateChange; otherwise build once.
    // This prevents expensive _buildGroundingContext() from running on every .state access.
    if (this._stateCache) return this._stateCache;
    return this._buildStateSnapshot();
  }

  get listening() {
    return this._listening;
  }
  get mode() {
    return this._mode;
  }
  get agentState() {
    return this._agentState;
  }
  get engine() {
    return this._engine;
  }
  get detectedLang() {
    return this._detectedLang;
  }

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
    if (partial.commercialProviderKind !== undefined)
      this._commercialProviderKind = partial.commercialProviderKind;
    if (partial.commercialProviderConfig !== undefined)
      this._commercialProviderConfig = partial.commercialProviderConfig;
    if (partial.energyLevel !== undefined) this._energyLevel = partial.energyLevel;
    if (partial.recordingDuration !== undefined)
      this._recordingDuration = partial.recordingDuration;
    if (partial.wakeWordEnabled !== undefined) this._wakeWordEnabled = partial.wakeWordEnabled;
    if (partial.wakeWordEnergyLevel !== undefined)
      this._wakeWordEnergyLevel = partial.wakeWordEnergyLevel;
    if (partial.detectedLang !== undefined) this._detectedLang = partial.detectedLang;
    if (partial.agentState !== undefined) this._agentState = partial.agentState;
    this._emitStateChange();
  }

  private _emitStateChange(): void {
    this._stateCache = this._buildStateSnapshot();
    this.emit('stateChange', this._stateCache);
  }

  onStateChange(handler: StateChangeHandler): () => void {
    const bound = (...args: unknown[]) => {
      const state = args[0] as VoiceAgentServiceState;
      handler(state);
    };
    this._subscriptions.set(handler, bound);
    this.on('stateChange', bound);
    return () => this.removeStateListener(handler);
  }

  removeStateListener(handler: StateChangeHandler): void {
    const bound = this._subscriptions.get(handler);
    if (bound) {
      this.off('stateChange', bound);
      this._subscriptions.delete(handler);
    }
  }

  private async _ensureVoiceService(): Promise<VoiceInputServiceType> {
    this._voiceService = await ensureVoiceAgentServiceBoundInstance({
      currentVoiceService: this._voiceService,
      loadVoiceInputRuntime,
      onResult: (result) => {
        void this._handleSttResult(result);
      },
      setState: (partial) => this._setState(partial),
      playError: () => Earcon.playError(),
    });
    return this._voiceService;
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────

  async start(targetMode?: VoiceAgentMode): Promise<void> {
    if (this._listening) return;
    if (this._exclusiveStartPromise) {
      return this._exclusiveStartPromise;
    }
    const p = this._runExclusiveStart(targetMode);
    this._exclusiveStartPromise = p;
    void p.finally(() => {
      if (this._exclusiveStartPromise === p) {
        this._exclusiveStartPromise = null;
      }
    });
    return p;
  }

  private async _runExclusiveStart(targetMode?: VoiceAgentMode): Promise<void> {
    const activateToken = ++this._voiceActivateToken;
    await runVoiceAgentExclusiveStart({
      ...(targetMode !== undefined ? { targetMode } : {}),
      activateToken,
      ensureVoiceService: () => this._ensureVoiceService(),
      isStartTokenCurrent: (token) => token === this._voiceActivateToken,
      setState: (partial) => this._setState(partial),
      resetSession: () => {
        this._session = createInitialSession();
      },
      getLangOverride: () => this._langOverride,
      getCorpusLang: () => this._corpusLang,
      getPreferredEngine: () => this._engine,
      getEnergyLevel: () => this._energyLevel,
      getBatteryLevel: () => this._batteryLevel,
      setBatteryLevel: (level) => {
        this._batteryLevel = level;
      },
      whisperServerUrl: this._whisperServerUrl,
      whisperServerModel: this._whisperServerModel,
      getCommercialProviderKind: () => this._commercialProviderKind,
      getCommercialProviderConfig: () => this._commercialProviderConfig,
      getSttEnhancementKind: () => this._sttEnhancementKind,
      getSttEnhancementConfig: () => this._sttEnhancementConfig,
      getSpeechQuality: () => this._speechQuality,
      onStartFailed: (message) => {
        this._setState({
          listening: false,
          speechActive: false,
          error: message,
          agentState: 'idle',
        });
        Earcon.playError();
      },
      onActivated: () => {
        void unlockAudio();
        Earcon.playActivate();
      },
    });
  }

  private async _cancelAndWaitExclusiveStart(): Promise<void> {
    await cancelVoiceAgentExclusiveStart({
      bumpActivateToken: () => {
        this._voiceActivateToken += 1;
      },
      getExclusiveStartPromise: () => this._exclusiveStartPromise,
      clearExclusiveStartPromise: () => {
        this._exclusiveStartPromise = null;
      },
    });
  }

  async stop(): Promise<void> {
    await runVoiceAgentStopFlow({
      cancelAndWaitExclusiveStart: () => this._cancelAndWaitExclusiveStart(),
      dictationController: this._dictationController,
      clearRecordingDurationTimer: () => this._clearRecordingDurationTimer(),
      speechQuality: this._speechQuality,
      voiceService: this._voiceService,
      setState: (partial) => this._setState(partial),
      session: this._session,
      saveSession: saveVoiceSession,
      onPersistError: (err) => {
        log.error('failed to persist session on deactivate', { err });
      },
      playDeactivate: () => Earcon.playDeactivate(),
    });
  }

  async toggle(targetMode?: VoiceAgentMode): Promise<void> {
    if (this._listening) {
      await this.stop();
    } else {
      await this.start(targetMode);
    }
  }

  // ── Dictation pipeline (Stage 4 — SpeechAnnotationPipeline) ─────────────

  startDictationPipeline(
    callbacks: DictationPipelineCallbacks,
    config?: QuickDictationConfig,
  ): void {
    this._dictationController.start(callbacks, config);
  }

  feedDictationSttResult(result: SttResult): void {
    this._dictationController.feedSttResult(result);
  }

  getDictationState() {
    return this._dictationController.getState();
  }

  skipDictationSegment(): void {
    this._dictationController.skip();
  }

  async undoDictationFill(): Promise<void> {
    await this._dictationController.undo();
  }

  stopDictationPipeline(): void {
    this._dictationController.stop();
  }

  // ── Push-to-talk ────────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    await startVoiceAgentRecording({
      ensureVoiceService: () => this._ensureVoiceService(),
      setState: (partial) => this._setState(partial),
      getRecordingDuration: () => this._recordingDuration,
      getRecordingDurationInterval: () => this._recordingDurationInterval,
      setRecordingDurationInterval: (timer) => {
        this._recordingDurationInterval = timer;
      },
      onError: (error) => {
        this._setState({
          isRecording: false,
          agentState: 'idle',
          error: error instanceof Error ? error.message : '\u5f55\u97f3\u542f\u52a8\u5931\u8d25',
        });
        Earcon.playError();
      },
    });
  }

  async stopRecording(): Promise<void> {
    await stopVoiceAgentRecording({
      voiceService: this._voiceService,
      setState: (partial) => this._setState(partial),
      getRecordingDurationInterval: () => this._recordingDurationInterval,
      setRecordingDurationInterval: (timer) => {
        this._recordingDurationInterval = timer;
      },
    });
  }

  private _clearRecordingDurationTimer(): void {
    if (this._recordingDurationInterval !== null) {
      clearInterval(this._recordingDurationInterval);
      this._recordingDurationInterval = null;
    }
  }

  // ── Engine & config ────────────────────────────────────────────────────

  switchEngine(newEngine: SttEngine): void {
    switchVoiceAgentEngineControl({
      newEngine,
      listening: this._listening,
      voiceService: this._voiceService,
      whisperServerUrl: this._whisperServerUrl,
      whisperServerModel: this._whisperServerModel,
      setEngine: (engine) => this._setState({ engine }),
      resetEngineSwitchCounter: () => {
        this._engineSwitchCounter = 0;
      },
    });
  }

  setCommercialProviderKind(kind: CommercialProviderKind): void {
    this._commercialProviderKind = kind;
    this._emitStateChange();
  }

  setCommercialProviderConfig(config: CommercialProviderCreateConfig): void {
    this._commercialProviderConfig = config;
    this._emitStateChange();
  }

  setSttEnhancementKind(kind: import('./stt').SttEnhancementSelectionKind): void {
    this._sttEnhancementKind = kind;
    this._syncVoiceServiceEnhancementConfig();
    this._emitStateChange();
  }

  setSttEnhancementConfig(config: import('./stt').SttEnhancementConfig): void {
    this._sttEnhancementConfig = config;
    this._syncVoiceServiceEnhancementConfig();
    this._emitStateChange();
  }

  async testCommercialProvider(): Promise<{ available: boolean; error?: string }> {
    return testVoiceAgentCommercialProvider(
      this._commercialProviderKind,
      this._commercialProviderConfig,
      loadSttRuntime,
    );
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
    applyVoiceAgentLangOverrideControl({
      lang,
      voiceService: this._voiceService,
      setLangOverride: (next) => {
        this._langOverride = next;
      },
      emitStateChange: () => this._emitStateChange(),
    });
  }

  private _syncVoiceServiceEnhancementConfig(): void {
    scheduleSyncVoiceServiceSttEnhancement({
      getVoiceService: () => this._voiceService,
      enhancementKind: this._sttEnhancementKind,
      enhancementConfig: this._sttEnhancementConfig,
    });
  }

  // ── Confirmation ──────────────────────────────────────────────────────

  confirmPending(): void {
    confirmVoiceAgentPendingAction({
      pendingConfirm: this._pendingConfirm,
      session: this._session,
      setPendingExecutionState: () => {
        this._setState({ pendingConfirm: null, agentState: 'executing' });
      },
      ...(this._onExecuteAction !== undefined && { onExecuteAction: this._onExecuteAction }),
      setIdleState: () => {
        this._setState({ agentState: 'idle' });
      },
    });
  }

  cancelPending(): void {
    cancelVoiceAgentPendingAction({
      clearPendingConfirm: () => {
        this._setState({ pendingConfirm: null });
      },
    });
  }

  // ── STT Result Handler ─────────────────────────────────────────────────

  private _dispatchSttResult(...params: Parameters<typeof dispatchVoiceAgentServiceSttResult>) {
    return dispatchVoiceAgentServiceSttResult(params[0]);
  }

  private async _handleSttResult(result: SttResult): Promise<void> {
    await runVoiceAgentServiceSttResultFlow({
      dispatchSttResult: (...params) => this._dispatchSttResult(...params),
      result,
      dictationPipeline: this._dictationController.getPipeline(),
      speechQuality: this._speechQuality ?? undefined,
      mode: this._mode,
      safeMode: this._safeMode,
      session: this._session,
      locale: this._locale,
      corpusLang: this._corpusLang,
      intentAliasMap: this._intentAliasMap,
      setState: (p) => this._setState(p),
      emitStateChange: () => this._emitStateChange(),
      ...(this._resolveIntentWithLlm !== undefined && {
        resolveIntentWithLlm: this._resolveIntentWithLlm,
      }),
      ...(this._onExecuteAction !== undefined && { onExecuteAction: this._onExecuteAction }),
      ...(this._onInsertDictation !== undefined && { onInsertDictation: this._onInsertDictation }),
      ...(this._onSendToAiChat !== undefined && { onSendToAiChat: this._onSendToAiChat }),
      ...(this._onToolCall !== undefined && { onToolCall: this._onToolCall }),
      onDictationPipelineFinalComplete: () => {
        this._speechQuality?.recordSegmentQuality('dictation');
        void this._checkAndSwitchEngineIfNeeded();
      },
      onBridgeApplied: (next) => {
        this._session = next.session;
        this._intentAliasMap = next.intentAliasMap;
        this._emitStateChange();
        this._checkAndSwitchEngineIfNeeded();
      },
    });
  }

  // ── Wake-word detector ─────────────────────────────────────────────────

  private _startWakeWordDetector(): void {
    startVoiceAgentWakeWordLifecycle({
      getHasDetector: () => Boolean(this._wakeWordDetector),
      setDetector: (detector) => {
        this._wakeWordDetector = detector;
      },
      onWake: () => {
        void this.start('command');
      },
      setWakeWordEnergyLevel: (rms) => {
        this._setState({ wakeWordEnergyLevel: rms });
      },
      setState: (partial) => {
        this._setState(partial);
      },
    });
  }

  private _stopWakeWordDetector(): void {
    this._wakeWordDetector = stopVoiceAgentWakeWordLifecycle(this._wakeWordDetector);
  }

  /**
   * Check if audio quality recommends a different STT engine and switch
   * if the recommendation is consistent (hysteresis to avoid flapping).
   * Called asynchronously after each final STT result.
   */
  private _checkAndSwitchEngineIfNeeded(): void {
    this._engineSwitchCounter = applyAdaptiveSttEngineRecommendation({
      listening: this._listening,
      currentEngine: this._engine,
      engineSwitchCounter: this._engineSwitchCounter,
      speechQuality: this._speechQuality,
      switchEngine: (engine) => this.switchEngine(engine),
    });
  }

  // ── Grounding Context (Stage 2) ─────────────────────────────────────────

  /**
   * Update UI-layer context used for building grounding context.
   * Call this whenever the active segment or selection changes.
   */
  setUiContext(context: Partial<VoiceAgentGroundingUiContext>): void {
    const next = applyVoiceAgentGroundingUiContext(
      {
        currentSegmentId: this._currentSegmentId,
        selectedSegmentIds: this._selectedSegmentIds,
        currentPhase: this._currentPhase,
        attentionHotspots: this._attentionHotspots,
      },
      context,
    );
    this._currentSegmentId = next.currentSegmentId;
    this._selectedSegmentIds = next.selectedSegmentIds;
    this._currentPhase = next.currentPhase;
    this._attentionHotspots = next.attentionHotspots;
    this._emitStateChange();
  }

  setLocale(locale: Locale): void {
    this._locale = locale;
    this._emitStateChange();
  }

  private _buildGroundingContext(): GroundingContextData {
    return buildVoiceAgentServiceGroundingContext({
      session: this._session,
      locale: this._locale,
      uiState: {
        currentSegmentId: this._currentSegmentId,
        selectedSegmentIds: this._selectedSegmentIds,
        currentPhase: this._currentPhase,
        attentionHotspots: this._attentionHotspots,
      },
    });
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    await runVoiceAgentDisposeFlow({
      cancelAndWaitExclusiveStart: () => this._cancelAndWaitExclusiveStart(),
      removeVisibilityListener: () => {
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);
      },
      ambientUnsubscribe: this._ambientUnsubscribe,
      dictationController: this._dictationController,
      voiceService: this._voiceService,
      clearVoiceServiceRef: () => {
        this._voiceService = null;
      },
      speechQuality: this._speechQuality,
      stopWakeWordDetector: () => this._stopWakeWordDetector(),
      clearRecordingDurationTimer: () => this._clearRecordingDurationTimer(),
      subscriptions: this._subscriptions,
      removeStateListener: (handler) => this.removeStateListener(handler),
      removeAllListeners: () => this.removeAllListeners(),
    });
  }

  // ── Session ────────────────────────────────────────────────────────────

  getSession(): VoiceSession {
    return this._session;
  }
}

// ADR-0028: `getVoiceAgentService` / `createVoiceAgentService` live in VoiceAgentService.singleton.ts (not barrel-re-exported here; avoids VoiceAgentService <-> singleton import cycle).
