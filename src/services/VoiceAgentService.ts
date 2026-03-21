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

import { EventEmitter } from 'events';
import { VoiceInputService } from './VoiceInputService';
import { WakeWordDetector } from './WakeWordDetector';
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
  getActionLabel,
  createVoiceSession,
  type ActionId,
  type VoiceIntent,
  type VoiceSession,
  type VoiceSessionEntry,
} from './IntentRouter';
import { toBcp47 } from '../utils/langMapping';
import { createCommercialProvider, testCommercialProvider as testCommercialProviderFactory, type CommercialProviderCreateConfig } from './stt';
import * as Earcon from './EarconService';
import type { SttEngine, SttResult, CommercialProviderKind } from './VoiceInputService';
import { globalContext } from './GlobalContextService';
import { userBehaviorStore } from './UserBehaviorStore';

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
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  commercialProviderKind?: CommercialProviderKind;
  commercialProviderConfig?: CommercialProviderCreateConfig;
  /** Called when the user confirms a pending action */
  onExecuteAction?: (actionId: ActionId) => void;
  /** Called for dictation text insertion */
  onInsertDictation?: (text: string) => void;
  /** Called for AI chat / analysis mode */
  onSendToAiChat?: (text: string) => void;
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

export class VoiceAgentService extends EventEmitter {
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
  private _recordingDuration = 0;
  private _wakeWordEnabled = false;
  private _wakeWordEnergyLevel = 0;
  private _detectedLang: string | null = null;
  private _agentState: VoiceAgentServiceState['agentState'] = 'idle';

  // ── Options ────────────────────────────────────────────────────────────────

  private readonly _corpusLang: string;
  private readonly _langOverride: string | null;
  private readonly _ollamaBaseUrl: string | undefined;
  private readonly _ollamaModel: string;
  private readonly _onExecuteAction: ((actionId: ActionId) => void) | undefined;
  private readonly _onInsertDictation: ((text: string) => void) | undefined;
  private readonly _onSendToAiChat: ((text: string) => void) | undefined;
  private readonly _resolveIntentWithLlm: ((input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>) | undefined;

  // ── Internal refs ────────────────────────────────────────────────────────

  // ── Subscription registry (leak prevention) ─────────────────────────────
  private readonly _subscriptions = new Map<StateChangeHandler, (...args: unknown[]) => void>();

  private _voiceService: VoiceInputService | null = null;
  private _wakeWordDetector: WakeWordDetector | null = null;
  private _recordingDurationInterval: ReturnType<typeof setInterval> | null = null;
  // ── Dictation pipeline (SpeechAnnotationPipeline) ───────────────────────
  private _dictationPipeline: SpeechAnnotationPipeline | null = null;

  // ── Environment & quality observers ─────────────────────────────────────
  private _ambientUnsubscribe: (() => void) | null = null;
  private _speechQuality: SpeechQualityAnalyzer | null = null;
  private _engineSwitchCounter = 0;
  private static readonly _ENGINE_SWITCH_THRESHOLD = 3; // require N consecutive recommendations before switching

  // ── UI context (set by page via setUiContext) ────────────────────────────
  private _currentSegmentId: string | null = null;
  private _selectedSegmentIds: string[] = [];
  private _currentPhase: string = 'transcribing';
  private _attentionHotspots: Array<{ segmentId: string; index: number; score: number }> = [];

  // ── Constructor ─────────────────────────────────────────────────────────

  constructor(options: VoiceAgentServiceOptions = {}) {
    super();
    this._corpusLang = options.corpusLang ?? 'cmn';
    this._langOverride = options.langOverride ?? null;
    this._safeMode = options.initialSafeMode ?? false;
    this._wakeWordEnabled = options.initialWakeWordEnabled ?? false;
    this._ollamaBaseUrl = options.ollamaBaseUrl;
    this._ollamaModel = options.ollamaModel ?? 'whisper-small';
    this._commercialProviderKind = options.commercialProviderKind ?? 'groq';
    this._commercialProviderConfig = options.commercialProviderConfig ?? {};
    this._onExecuteAction = options.onExecuteAction;
    this._onInsertDictation = options.onInsertDictation;
    this._onSendToAiChat = options.onSendToAiChat;
    this._resolveIntentWithLlm = options.resolveIntentWithLlm;

    // Load most recent session from IndexedDB
    void loadRecentVoiceSessions(1).then(([recent]) => {
      if (recent && recent.entries.length > 0) {
        this._session = recent;
        this._emitStateChange();
      }
    }).catch(() => { /* IndexedDB unavailable — silently skip */ });

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
  }

  // ── Public getters (read-only state) ───────────────────────────────────

  get state(): VoiceAgentServiceState {
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
    Object.assign(this, partial);
    this._emitStateChange();
  }

  private _emitStateChange(): void {
    this.emit('stateChange', this.state);
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
    super.on('stateChange', bound);
    return () => this.removeStateListener(handler);
  }

  /**
   * Remove a state change listener by its original handler reference.
   * No-op if the handler was never subscribed.
   */
  removeStateListener(handler: StateChangeHandler): void {
    const bound = this._subscriptions.get(handler);
    if (bound) {
      super.off('stateChange', bound);
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

  private _ensureVoiceService(): VoiceInputService {
    if (!this._voiceService) {
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
        (this._voiceService as VoiceInputService & { onVadStateChange: (fn: (active: boolean) => void) => void }).onVadStateChange((active) => {
          this._setState({ speechActive: active });
        });
      }
      if ('onEnergyLevel' in this._voiceService && typeof this._voiceService.onEnergyLevel === 'function') {
        (this._voiceService as VoiceInputService & { onEnergyLevel: (fn: (rms: number) => void) => void }).onEnergyLevel((rms) => {
          this._setState({ energyLevel: rms });
        });
      }
    }
    return this._voiceService;
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────

  start(targetMode?: VoiceAgentMode): void {
    if (this._listening) return;

    if (targetMode) this._setState({ mode: targetMode });
    this._setState({ error: null, pendingConfirm: null, agentState: 'listening' });
    this._session = createInitialSession();

    const svc = this._ensureVoiceService();
    const lang = this._getEffectiveLang();

    const startConfig: Parameters<typeof svc.start>[0] = {
      lang,
      continuous: true,
      interimResults: true,
      preferredEngine: this._engine,
      maxAlternatives: 3,
    };
    if (this._ollamaBaseUrl) startConfig.ollamaBaseUrl = this._ollamaBaseUrl;
    if (this._ollamaModel) startConfig.ollamaModel = this._ollamaModel;
    if (this._engine === 'commercial' && this._commercialProviderConfig) {
      startConfig.commercialFallback = createCommercialProvider(
        this._commercialProviderKind,
        this._commercialProviderConfig,
      );
    }
    svc.start(startConfig);
    Earcon.playActivate();
  }

  stop(): void {
    this._voiceService?.stop();
    this._setState({
      listening: false,
      speechActive: false,
      interimText: '',
      pendingConfirm: null,
      agentState: 'idle',
    });

    if (this._session.entries.length > 0) {
      void saveVoiceSession(this._session).catch(() => { /* IndexedDB unavailable */ });
    }

    Earcon.playDeactivate();
  }

  toggle(targetMode?: VoiceAgentMode): void {
    if (this._listening) {
      this.stop();
    } else {
      this.start(targetMode);
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
    const svc = this._ensureVoiceService();
    this._setState({ isRecording: true, recordingDuration: 0, agentState: 'listening' });
    this._recordingDurationInterval = setInterval(() => {
      this._setState({ recordingDuration: this._recordingDuration + 1 });
    }, 1000);
    await svc.startRecording();
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
    this._setState({ engine: newEngine });
    if (this._listening) {
      this._voiceService?.switchEngine(newEngine);
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
    return testCommercialProviderFactory(this._commercialProviderKind, this._commercialProviderConfig);
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
    // Note: langOverride is stored in options, not mutable after construction
    // For dynamic language override, use a separate mechanism
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

    let intent = routeIntent(result.text, this._mode);
    console.log('[DEBUG] routeIntent:', JSON.stringify({ text: result.text, mode: this._mode, intentType: intent.type }));

    // LLM fallback for chat intents
    let llmFallbackFailed = false;
    if (intent.type === 'chat' && this._mode === 'command' && this._resolveIntentWithLlm) {
      try {
        const fallbackIntent = await this._resolveIntentWithLlm({
          text: result.text,
          mode: this._mode,
          session: this._session,
        });
        if (fallbackIntent) {
          intent = fallbackIntent;
        } else {
          llmFallbackFailed = true;
          this._setState({ error: '无法识别该指令，请重试或切换到"分析"模式直接发送文本' });
        }
      } catch (err) {
        llmFallbackFailed = true;
        this._setState({ error: err instanceof Error ? err.message : 'LLM intent解析失败' });
      }
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
        const needsConfirm = intent.fromFuzzy || (this._safeMode && isDestructiveAction(intent.actionId));
        if (needsConfirm) {
          const label = intent.fromFuzzy
            ? `[模糊] ${getActionLabel(intent.actionId)}`
            : getActionLabel(intent.actionId);
          this._setState({ pendingConfirm: { actionId: intent.actionId, label, ...(intent.fromFuzzy !== undefined && { fromFuzzy: intent.fromFuzzy }) }, agentState: 'idle' });
          Earcon.playTick();
        } else {
          this._onExecuteAction?.(intent.actionId);
          Earcon.playSuccess();
          globalContext.markSessionStart();
          userBehaviorStore.recordAction({ actionId: intent.actionId, durationMs: 0, sessionId: this._session.id });
          this._setState({ agentState: 'idle' });
        }
        break;
      }
      case 'tool': {
        this._onSendToAiChat?.(`[语音指令] ${intent.raw}`);
        Earcon.playSuccess();
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

    try {
      const detector = new WakeWordDetector({
        energyThreshold: 0.05,
        speechMs: 400,
        cooldownMs: 3000,
        onWake: () => {
          this.start('command');
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
    } catch {
      this._wakeWordEnabled = false;
      this._emitStateChange();
    }
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
    this._ambientUnsubscribe?.();
    this._voiceService?.dispose();
    this._voiceService = null;
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
