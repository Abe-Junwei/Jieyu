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
import { AmbientObserver } from './AmbientObserver';
import { SpeechQualityAnalyzer } from './SpeechQualityAnalyzer';
import { saveVoiceSession, loadRecentVoiceSessions } from './VoiceSessionStore';
import type {
  AnnotationLayer,
  QuickDictationConfig,
  DictationPipelineCallbacks,
} from './SpeechAnnotationPipeline';
import {
  createVoiceSession,
  loadVoiceIntentAliasMap,
  type ActionId,
  type VoiceIntent,
  type VoiceSession,
} from './IntentRouter';
import { toBcp47 } from '../utils/langMapping';
import type { CommercialProviderCreateConfig } from './stt';
import { resolveVoiceAgentRuntimeConfig } from './config/voiceAgentRuntimeConfig';
import { detectRegion } from '../utils/regionDetection';
import * as Earcon from './EarconService';
import { unlockAudio } from './EarconService';
import { globalContext } from './GlobalContextService';
import { applyVoiceConfirmedPendingTelemetry } from './voiceConfirmedPendingTelemetry';
import {
  buildVoiceAgentGroundingContext,
  type GroundingContextData,
  type VoiceAgentGroundingUiContext,
} from './VoiceAgentGroundingContext';
import { createLogger } from '../observability/logger';
import { BrowserEventEmitter } from './VoiceAgentService.eventEmitter';
import { dispatchVoiceAgentServiceSttResult } from './VoiceAgentService.sttResultDispatch';
import { VoiceAgentDictationController } from './VoiceAgentDictationController';
import { buildVoiceAgentServiceStateSnapshot } from './VoiceAgentService.state';
import {
  buildVoiceAgentStartConfig,
  testVoiceAgentCommercialProvider,
} from './VoiceAgentService.runtime';
import { bindVoiceAgentWakeWordStart } from './VoiceAgentService.wakeWordBindings';
import {
  startVoiceAgentRecording,
  stopVoiceAgentRecording,
} from './VoiceAgentService.recordingControls';
import { scheduleSyncVoiceServiceSttEnhancement } from './VoiceAgentService.sttEnhancementSync';
import { applyAdaptiveSttEngineRecommendation } from './VoiceAgentService.adaptiveEngineSwitch';
import {
  resolveVoiceAgentEffectiveLang,
  scheduleVoiceAgentBatteryLevelRefresh,
} from './VoiceAgentService.langAndBattery';
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
import {
  loadSttRuntime,
  loadSttStrategyRuntime,
  loadVoiceInputRuntime,
} from './voiceRuntimeLoaders';

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
    const runtimeConfig = resolveVoiceAgentRuntimeConfig({
      ...(options.whisperServerUrl !== undefined && { whisperServerUrl: options.whisperServerUrl }),
      ...(options.whisperServerModel !== undefined && {
        whisperServerModel: options.whisperServerModel,
      }),
      ...(options.commercialProviderKind !== undefined && {
        commercialProviderKind: options.commercialProviderKind,
      }),
      ...(options.commercialProviderConfig !== undefined && {
        commercialProviderConfig: options.commercialProviderConfig,
      }),
      ...(options.sttEnhancementKind !== undefined && {
        sttEnhancementKind: options.sttEnhancementKind,
      }),
      ...(options.sttEnhancementConfig !== undefined && {
        sttEnhancementConfig: options.sttEnhancementConfig,
      }),
    });
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
    const dictationOpts: {
      onTransformDictationPipelineFill?: (input: {
        layer: AnnotationLayer;
        text: string;
        segmentId: string;
      }) => Promise<string>;
    } = {};
    if (options.onTransformDictationPipelineFill) {
      dictationOpts.onTransformDictationPipelineFill = options.onTransformDictationPipelineFill;
    }
    this._dictationController = new VoiceAgentDictationController(dictationOpts);
    this._onSendToAiChat = options.onSendToAiChat;
    this._onToolCall = options.onToolCall;
    this._resolveIntentWithLlm = options.resolveIntentWithLlm;

    // Load most recent session from IndexedDB
    void loadRecentVoiceSessions(1)
      .then(([recent]) => {
        if (recent && recent.entries.length > 0) {
          this._session = recent;
          this._emitStateChange();
        }
      })
      .catch((err) => {
        log.error('failed to restore session from IndexedDB', { err });
      });

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

    // \u9875\u9762\u5173\u95ed / \u9690\u85cf\u65f6\u4fdd\u5b58\u4f1a\u8bdd | Save session on page hide / close
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  // ── Public getters (read-only state) ───────────────────────────────────

  get state(): VoiceAgentServiceState {
    // Return cached state if already built by _emitStateChange; otherwise build once.
    // This prevents expensive _buildGroundingContext() from running on every .state access.
    if (this._stateCache) return this._stateCache;
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
    this._stateCache = buildVoiceAgentServiceStateSnapshot({
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

  private _getEffectiveLang(): string {
    return resolveVoiceAgentEffectiveLang({
      langOverride: this._langOverride,
      corpusLang: this._corpusLang,
    });
  }

  /** Asynchronously refresh the cached battery level (fire-and-forget).
   * \u5f02\u6b65\u66f4\u65b0\u7535\u91cf\u7f13\u5b58，\u4e0b\u6b21 chooseSttEngine \u65f6\u751f\u6548。 */
  private _refreshBatteryLevel(): void {
    scheduleVoiceAgentBatteryLevelRefresh((level) => {
      this._batteryLevel = level;
    });
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
      if (
        'onVadStateChange' in this._voiceService &&
        typeof this._voiceService.onVadStateChange === 'function'
      ) {
        (
          this._voiceService as VoiceInputServiceType & {
            onVadStateChange: (fn: (active: boolean) => void) => void;
          }
        ).onVadStateChange((active) => {
          this._setState({ speechActive: active });
        });
      }
      if (
        'onEnergyLevel' in this._voiceService &&
        typeof this._voiceService.onEnergyLevel === 'function'
      ) {
        (
          this._voiceService as VoiceInputServiceType & {
            onEnergyLevel: (fn: (rms: number) => void) => void;
          }
        ).onEnergyLevel((rms) => {
          this._setState({ energyLevel: rms });
        });
      }
    }

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

    if (targetMode) this._setState({ mode: targetMode });
    this._setState({ error: null, pendingConfirm: null, agentState: 'listening' });
    this._session = createInitialSession();

    const svc = await this._ensureVoiceService();
    if (activateToken !== this._voiceActivateToken) {
      try {
        svc.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    const lang = this._getEffectiveLang();

    // Refresh battery level for next call; use cached value now | \u5f02\u6b65\u5237\u65b0\u7535\u91cf，\u5f53\u524d\u7528\u7f13\u5b58\u503c
    this._refreshBatteryLevel();
    const region = await detectRegion();
    if (activateToken !== this._voiceActivateToken) {
      try {
        svc.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    const { chooseSttEngine } = await loadSttStrategyRuntime();
    const runtimeEngine = chooseSttEngine({
      preferred: this._engine,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      noiseLevel: this._energyLevel,
      ...(this._batteryLevel !== undefined && { batteryLevel: this._batteryLevel }),
      regionHint: region,
    });

    const startConfig = await buildVoiceAgentStartConfig({
      lang,
      runtimeEngine,
      region,
      whisperServerUrl: this._whisperServerUrl,
      whisperServerModel: this._whisperServerModel,
      commercialProviderKind: this._commercialProviderKind,
      commercialProviderConfig: this._commercialProviderConfig,
      sttEnhancementKind: this._sttEnhancementKind,
      sttEnhancementConfig: this._sttEnhancementConfig,
      loadSttRuntime,
    });
    if (activateToken !== this._voiceActivateToken) {
      try {
        svc.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await svc.start(startConfig);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '\u8bed\u97f3\u670d\u52a1\u542f\u52a8\u5931\u8d25 | Failed to start voice service';
      this._setState({
        listening: false,
        speechActive: false,
        error: message,
        agentState: 'idle',
      });
      Earcon.playError();
      return;
    }

    if (activateToken !== this._voiceActivateToken) {
      try {
        svc.stop();
      } catch {
        /* ignore */
      }
      return;
    }

    // Start speech quality analyzer after the voice service has a live MediaStream.
    // This must happen AFTER svc.start() so that createAnalysisCloneStream()
    // can successfully clone the shared microphone stream.
    if (this._speechQuality && !this._speechQuality.isActive) {
      const stream = await this._voiceService!.createAnalysisCloneStream();
      if (activateToken !== this._voiceActivateToken) {
        try {
          svc.stop();
        } catch {
          /* ignore */
        }
        this._speechQuality.stop();
        return;
      }
      if (stream) {
        await this._speechQuality.start(stream);
      } else {
        // Fallback: let SpeechQualityAnalyzer request its own getUserMedia.
        // This may prompt the browser for microphone permission a second time.
        void this._speechQuality.start();
      }
    }

    if (activateToken !== this._voiceActivateToken) {
      try {
        svc.stop();
      } catch {
        /* ignore */
      }
      this._speechQuality?.stop();
      return;
    }

    void unlockAudio();
    Earcon.playActivate();
  }

  async stop(): Promise<void> {
    this._voiceActivateToken += 1;
    const pendingExclusiveStart = this._exclusiveStartPromise;
    this._exclusiveStartPromise = null;
    if (pendingExclusiveStart) {
      try {
        await pendingExclusiveStart;
      } catch {
        /* _runExclusiveStart may reject; continue to release the mic */
      }
    }
    this._dictationController.stop();
    this._clearRecordingDurationTimer();
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
      void saveVoiceSession(this._session).catch((err) => {
        log.error('failed to persist session on deactivate', { err });
      });
    }

    Earcon.playDeactivate();
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
    this._engineSwitchCounter = 0;
    this._setState({ engine: newEngine });
    // \u6301\u4e45\u5316\u5f15\u64ce\u504f\u597d | Persist engine preference
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
    this._langOverride = lang;
    // \u540c\u6b65\u66f4\u65b0\u6b63\u5728\u8fd0\u884c\u7684 VoiceInputService | Sync to running VoiceInputService
    if (this._voiceService && lang) {
      const bcp47 = lang === '__auto__' ? '' : (toBcp47(lang) ?? lang);
      this._voiceService.setLang(bcp47);
    }
    this._emitStateChange();
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
    if (!this._pendingConfirm) return;
    const { actionId, params } = this._pendingConfirm;
    this._setState({ pendingConfirm: null, agentState: 'executing' });
    this._onExecuteAction?.(actionId, params);
    applyVoiceConfirmedPendingTelemetry({
      actionId,
      sessionId: this._session.id,
      inputModality: 'voice',
    });
    this._setState({ agentState: 'idle' });
  }

  cancelPending(): void {
    this._setState({ pendingConfirm: null });
    Earcon.playTick();
  }

  // ── STT Result Handler ─────────────────────────────────────────────────

  private async _handleSttResult(result: SttResult): Promise<void> {
    const out = await dispatchVoiceAgentServiceSttResult({
      result,
      dictationPipeline: this._dictationController.getPipeline(),
      speechQuality: this._speechQuality ?? undefined,
      setState: (p) => this._setState(p),
      onDictationPipelineFinalComplete: () => {
        this._speechQuality?.recordSegmentQuality('dictation');
        void this._checkAndSwitchEngineIfNeeded();
      },
      getBridgeFields: () => ({
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
        ...(this._onInsertDictation !== undefined && {
          onInsertDictation: this._onInsertDictation,
        }),
        ...(this._onSendToAiChat !== undefined && { onSendToAiChat: this._onSendToAiChat }),
        ...(this._onToolCall !== undefined && { onToolCall: this._onToolCall }),
      }),
    });
    if (out.status === 'consumed') {
      return;
    }
    this._session = out.session;
    this._intentAliasMap = out.intentAliasMap;
    this._emitStateChange();
    this._checkAndSwitchEngineIfNeeded();
  }

  // ── Wake-word detector ─────────────────────────────────────────────────

  private _startWakeWordDetector(): void {
    bindVoiceAgentWakeWordStart({
      getHasDetector: () => Boolean(this._wakeWordDetector),
      setDetector: (detector) => {
        this._wakeWordDetector = detector;
      },
      onWake: () => {
        void this.start('command');
      },
      onWakeEnergy: (rms) => {
        this._setState({ wakeWordEnergyLevel: rms });
      },
      onStartFailed: (err) => {
        log.warn('wake-word detector start failed, disabling', { err });
        this._setState({
          wakeWordEnabled: false,
          error:
            '\u8bed\u97f3\u5524\u9192\u542f\u52a8\u5931\u8d25，\u5df2\u81ea\u52a8\u5173\u95ed。\u8bf7\u68c0\u67e5\u9ea6\u514b\u98ce\u6743\u9650\u540e\u91cd\u8bd5。',
        });
      },
      onSetupFailed: (err) => {
        log.warn('wake-word detector setup failed, disabling', { err });
        this._setState({
          wakeWordEnabled: false,
          error:
            '\u8bed\u97f3\u5524\u9192\u521d\u59cb\u5316\u5931\u8d25，\u5df2\u81ea\u52a8\u5173\u95ed。\u8bf7\u7a0d\u540e\u91cd\u8bd5。',
        });
      },
    });
  }

  private _stopWakeWordDetector(): void {
    this._wakeWordDetector?.stop();
    this._wakeWordDetector = null;
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
    if (context.currentSegmentId !== undefined)
      this._currentSegmentId = context.currentSegmentId ?? null;
    if (context.selectedSegmentIds !== undefined)
      this._selectedSegmentIds = context.selectedSegmentIds;
    if (context.currentPhase !== undefined) this._currentPhase = context.currentPhase;
    if (context.attentionHotspots !== undefined)
      this._attentionHotspots = context.attentionHotspots;
    this._emitStateChange();
  }

  setLocale(locale: Locale): void {
    this._locale = locale;
    this._emitStateChange();
  }

  private _buildGroundingContext(): GroundingContextData {
    return buildVoiceAgentGroundingContext({
      corpus: globalContext.getCorpusContext(),
      profile: globalContext.getBehaviorProfile(),
      session: this._session,
      locale: this._locale,
      uiContext: {
        currentSegmentId: this._currentSegmentId,
        selectedSegmentIds: this._selectedSegmentIds,
        currentPhase: this._currentPhase,
        attentionHotspots: this._attentionHotspots,
      },
    });
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    this._voiceActivateToken += 1;
    const pendingExclusiveStart = this._exclusiveStartPromise;
    this._exclusiveStartPromise = null;
    if (pendingExclusiveStart) {
      try {
        await pendingExclusiveStart;
      } catch {
        /* ignore */
      }
    }
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    this._ambientUnsubscribe?.();
    this._dictationController.stop();
    this._voiceService?.dispose();
    this._voiceService?.releaseSharedAnalysisStream();
    this._voiceService = null;
    this._speechQuality?.stop();
    this._stopWakeWordDetector();
    this._clearRecordingDurationTimer();
    // Remove all tracked subscriptions cleanly
    // 先快照 keys 再逐个移除，避免迭代 Map 时删除元素
    // | Snapshot keys first to avoid mutating Map during iteration
    const handlers = Array.from(this._subscriptions.keys());
    for (const handler of handlers) {
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

// ADR-0028: `getVoiceAgentService` / `createVoiceAgentService` live in VoiceAgentService.singleton.ts (not barrel-re-exported here; avoids VoiceAgentService <-> singleton import cycle).
