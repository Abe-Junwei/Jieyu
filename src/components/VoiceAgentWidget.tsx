/**
 * VoiceAgentWidget — 语音智能体 UI 组件
 *
 * 包含麦克风按钮、模式选择器、引擎选择器、商业 STT 配置面板和即时转写显示。
 *
 * @see 解语-语音智能体架构设计方案 §4.6
 */

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Brain, Check, ChevronDown, History, Mic, MicOff, SlidersHorizontal, X } from 'lucide-react';
import { getConfidenceColor, type VoiceAgentMode, type VoiceAgentState, type VoicePendingConfirm } from '../hooks/useVoiceAgent';
import { SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';
import type { SttEngine } from '../services/VoiceInputService';
import { commercialProviderDefinitions } from '../services/stt';
import type { CommercialProviderKind } from '../services/VoiceInputService';
import type { ActionIntent, VoiceIntent, VoiceSession } from '../services/IntentRouter';
import { t, tf, useLocale } from '../i18n';
import {
  clearVoiceAliasLearningLog,
  getActionLabel,
  getVoiceAliasLearningReasonLabel,
  loadVoiceAliasLearningLog,
  type VoiceAliasLearningLogEntry,
} from '../services/voiceIntentUi';

// ── Types ──

export interface VoiceAgentWidgetProps {
  listening: boolean;
  speechActive: boolean;
  mode: VoiceAgentMode;
  interimText: string;
  finalText: string;
  confidence: number;
  error: string | null;
  /** Most recently routed intent — used for ARIA live announcements. */
  lastIntent: VoiceIntent | null;
  pendingConfirm: VoicePendingConfirm | null;
  disambiguationOptions: ActionIntent[];
  safeMode: boolean;
  /** Whether wake-word detection is enabled. */
  wakeWordEnabled: boolean;
  /** Live RMS energy level from the wake-word detector (0–1). */
  wakeWordEnergyLevel: number;
  corpusLang: string;
  langOverride: string | null;
  /** Detected language BCP-47 from the latest STT result (auto mode only). */
  detectedLang: string | null;
  engine: SttEngine;
  isRecording: boolean;
  /** Audio energy level 0–1 (from VAD RMS, web-speech only). */
  energyLevel: number;
  /** Multi-agent pipeline state — which agent is currently active */
  agentState: VoiceAgentState['agentState'];
  /** Seconds elapsed since push-to-talk recording started. */
  recordingDuration: number;
  /** Voice session history */
  session: VoiceSession;
  /** Commercial provider kind when engine === 'commercial' */
  commercialProviderKind: CommercialProviderKind;
  /** Commercial provider config (full object) */
  commercialProviderConfig: { apiKey?: string; baseUrl?: string; model?: string; appId?: string; accessToken?: string };
  /** 听写预览文本样式 | Preview text props for dictation snippets */
  dictationPreviewTextProps?: OrthographyPreviewTextProps;
  /** 当前语音写入/作用目标摘要 | Current target summary for voice actions */
  targetSummary: string;
  /** 当前状态摘要 | Current status summary */
  statusSummary: string;
  /** 当前环境摘要 | Current environment summary */
  environmentSummary: string;
  /** 当前选中句段/焦点范围摘要 | Current focused selection summary */
  selectionSummary: string;
  onToggle: (mode?: VoiceAgentMode) => void;
  onMicPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp?: () => void;
  onSwitchMode: (mode: VoiceAgentMode) => void;
  onSwitchEngine: (engine: SttEngine) => void;
  onSelectDisambiguation: (actionId: ActionIntent['actionId']) => void;
  onDismissDisambiguation: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSetSafeMode: (on: boolean) => void;
  onSetWakeWordEnabled: (on: boolean) => void;
  onSetLangOverride: (lang: string | null) => void;
  onSetCommercialProviderKind: (kind: CommercialProviderKind) => void;
  onCommercialConfigChange: (config: { apiKey?: string; baseUrl?: string; model?: string; appId?: string; accessToken?: string }) => void;
  onTestCommercialProvider: () => Promise<{ available: boolean; error?: string }>;
}

// ── Mode labels ──

const MODE_LABEL_KEYS = {
  command: 'ai.assistantHub.mode.command',
  dictation: 'ai.assistantHub.mode.dictation',
  analysis: 'ai.assistantHub.mode.analysis',
} as const;

const MODE_ORDER: VoiceAgentMode[] = ['command', 'dictation', 'analysis'];

const MODE_HINT_KEYS = {
  command: {
    idle: 'transcription.voiceWidget.modeHint.command.idle',
    active: 'transcription.voiceWidget.modeHint.command.active',
  },
  dictation: {
    idle: 'transcription.voiceWidget.modeHint.dictation.idle',
    active: 'transcription.voiceWidget.modeHint.dictation.active',
  },
  analysis: {
    idle: 'transcription.voiceWidget.modeHint.analysis.idle',
    active: 'transcription.voiceWidget.modeHint.analysis.active',
  },
} as const;

const MODE_WORKSPACE_LABEL_KEYS = {
  command: 'transcription.voiceWidget.workspace.command',
  dictation: 'transcription.voiceWidget.workspace.dictation',
  analysis: 'transcription.voiceWidget.workspace.analysis',
} as const;

const MODE_PROCESS_LABEL_KEYS = {
  command: 'transcription.voiceWidget.process.command',
  dictation: 'transcription.voiceWidget.process.dictation',
  analysis: 'transcription.voiceWidget.process.analysis',
} as const;

const AGENT_STATE_LABEL_KEYS: Record<VoiceAgentState['agentState'], Parameters<typeof t>[1]> = {
  idle: 'transcription.voice.status.standby',
  listening: 'transcription.voice.status.listening',
  routing: 'transcription.voiceWidget.agentState.routing',
  executing: 'transcription.voiceWidget.agentState.executing',
  'ai-thinking': 'transcription.voiceWidget.agentState.aiThinking',
};

// ── Helpers ──

function isVolcengine(kind: CommercialProviderKind): boolean {
  return kind === 'volcengine';
}

// ── Component ──

export const VoiceAgentWidget = memo(function VoiceAgentWidget(props: VoiceAgentWidgetProps) {
  const locale = useLocale();
  const {
    listening,
    speechActive,
    mode,
    interimText,
    finalText,
    confidence,
    error,
    lastIntent,
    pendingConfirm,
    disambiguationOptions,
    safeMode,
    wakeWordEnabled,
    wakeWordEnergyLevel,
    corpusLang,
    langOverride,
    detectedLang,
    engine,
    isRecording,
    agentState,
    energyLevel,
    recordingDuration,
    session,
    commercialProviderKind,
    commercialProviderConfig,
    dictationPreviewTextProps,
    targetSummary,
    statusSummary,
    environmentSummary,
    selectionSummary,
    onToggle,
    onMicPointerDown,
    onMicPointerUp,
    onSwitchMode,
    onSwitchEngine,
    onSelectDisambiguation,
    onDismissDisambiguation,
    onConfirm,
    onCancel,
    onSetSafeMode,
    onSetWakeWordEnabled,
    onSetLangOverride,
    onSetCommercialProviderKind,
    onCommercialConfigChange,
    onTestCommercialProvider,
  } = props;

  const displayText = interimText || finalText;
  const confidenceColor = confidence > 0 ? getConfidenceColor(confidence) : undefined;

  const confidenceStyle: CSSProperties | undefined = confidenceColor
    ? { borderColor: confidenceColor }
    : undefined;

  const [showSettings, setShowSettings] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [insightTab, setInsightTab] = useState<'history' | 'learning'>('history');
  const showCommercialConfig = showSettings && engine === 'commercial';

  // Local state for commercial config fields (initialized from prop, synced via useEffect)
  const [localApiKey, setLocalApiKey] = useState('');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [localModel, setLocalModel] = useState('');
  const [localAppId, setLocalAppId] = useState('');
  const [localAccessToken, setLocalAccessToken] = useState('');
  const [providerAvailability, setProviderAvailability] = useState<'idle' | 'testing' | 'available' | 'unavailable'>('idle');
  const [providerError, setProviderError] = useState<string | null>(null);
  const [learningLogEntries, setLearningLogEntries] = useState<VoiceAliasLearningLogEntry[]>([]);
  /** Current ARIA live announcement text. */
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');

  // Load voice alias learning log on mount
  useEffect(() => {
    setLearningLogEntries(loadVoiceAliasLearningLog());
  }, []);

  // Compute ARIA announcement when intent or error changes
  useEffect(() => {
    if (error) {
      setAriaAnnouncement(tf(locale, 'transcription.voiceWidget.aria.error', { error }));
      return;
    }
    if (lastIntent?.type === 'action') {
      const label = getActionLabel(lastIntent.actionId as Parameters<typeof getActionLabel>[0], locale);
      setAriaAnnouncement(tf(locale, 'transcription.voiceWidget.aria.executed', { label }));
    }
  }, [error, lastIntent, locale]);

  // Cache last test result — avoid redundant API calls within CACHE_TTL_MS
  const lastTestRef = useRef<{ result: { available: boolean; error?: string }; ts: number } | null>(null);
  const CACHE_TTL_MS = 30_000;

  // Sync incoming config changes to local state
  useEffect(() => {
    setLocalApiKey(commercialProviderConfig.apiKey ?? '');
    setLocalBaseUrl(commercialProviderConfig.baseUrl ?? '');
    setLocalModel(commercialProviderConfig.model ?? '');
    setLocalAppId(commercialProviderConfig.appId ?? '');
    setLocalAccessToken(commercialProviderConfig.accessToken ?? '');
    setProviderAvailability('idle');
    setProviderError(null);
    lastTestRef.current = null; // invalidate cached test result
  }, [commercialProviderConfig]);

  const handleTestProvider = useCallback(async () => {
    // Return cached result if still fresh
    if (lastTestRef.current && Date.now() - lastTestRef.current.ts < CACHE_TTL_MS) {
      const cached = lastTestRef.current.result;
      setProviderAvailability(cached.available ? 'available' : 'unavailable');
      setProviderError(cached.available ? null : (cached.error ?? t(locale, 'transcription.voiceWidget.provider.unavailable')));
      return;
    }
    setProviderAvailability('testing');
    setProviderError(null);
    const result = await onTestCommercialProvider();
    lastTestRef.current = { result, ts: Date.now() };
    setProviderAvailability(result.available ? 'available' : 'unavailable');
    setProviderError(result.available ? null : (result.error ?? t(locale, 'transcription.voiceWidget.provider.unavailable')));
  }, [locale, onTestCommercialProvider]);

  // Build updated config and notify parent when any field changes
  const notifyConfigChange = (newApiKey: string, newBaseUrl: string, newModel: string, newAppId: string, newAccessToken: string) => {
    onCommercialConfigChange({
      apiKey: newApiKey,
      baseUrl: newBaseUrl,
      model: newModel,
      appId: newAppId,
      accessToken: newAccessToken,
    });
  };

  const modeLabels: Record<VoiceAgentMode, string> = {
    command: t(locale, MODE_LABEL_KEYS.command),
    dictation: t(locale, MODE_LABEL_KEYS.dictation),
    analysis: t(locale, MODE_LABEL_KEYS.analysis),
  };
  const sessionHint = listening
    ? t(locale, MODE_HINT_KEYS[mode].active)
    : t(locale, MODE_HINT_KEYS[mode].idle);
  const sessionText = displayText || sessionHint;
  const isSessionEmpty = displayText.length === 0;
  const sessionTextPreviewProps = mode === 'dictation' && !isSessionEmpty ? dictationPreviewTextProps : undefined;
  const sessionTargetLabel = mode === 'dictation'
    ? t(locale, 'transcription.voiceWidget.targetLabel.dictation')
    : mode === 'analysis'
      ? t(locale, 'transcription.voiceWidget.targetLabel.analysis')
      : t(locale, 'transcription.voiceWidget.targetLabel.command');
  const processLabel = mode === 'dictation'
    ? t(locale, 'transcription.voiceWidget.processLabel.dictation')
    : mode === 'analysis'
      ? t(locale, 'transcription.voiceWidget.processLabel.analysis')
      : t(locale, 'transcription.voiceWidget.processLabel.command');
  const detailLabel = mode === 'command'
    ? t(locale, 'transcription.voiceWidget.detailLabel.command')
    : t(locale, 'transcription.voiceWidget.detailLabel.range');
  const workspaceLabel = t(locale, MODE_WORKSPACE_LABEL_KEYS[mode]);
  const processSummary = t(locale, MODE_PROCESS_LABEL_KEYS[mode]);
  const lastIntentSummary = (() => {
    if (!lastIntent) return t(locale, 'transcription.voiceWidget.common.none');
    switch (lastIntent.type) {
      case 'action':
        return getActionLabel(lastIntent.actionId, locale);
      case 'dictation':
        return t(locale, 'transcription.voiceWidget.lastIntent.dictation');
      case 'tool':
        return lastIntent.toolName;
      case 'slot-fill':
        return `${lastIntent.slotName}: ${lastIntent.value}`;
      case 'chat':
      default:
        return lastIntent.text.length > 18
          ? `${lastIntent.text.slice(0, 18)}…`
          : lastIntent.text || t(locale, 'transcription.voiceWidget.common.none');
    }
  })();
  const detailSummary = mode === 'command' ? lastIntentSummary : selectionSummary;
  const insightCount = session.entries.length + learningLogEntries.length;
  const agentStateLabel = t(locale, AGENT_STATE_LABEL_KEYS[agentState]);

  return (
    <div className="voice-agent-widget">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="voice-agent-aria-live"
        role="status"
      >
        {ariaAnnouncement}
      </div>
      <div className="voice-agent-shell">
        <div className="voice-agent-header">
          <div className="voice-agent-header-main">
            <button
              type="button"
              className={`voice-agent-mic-btn ${listening ? 'voice-agent-mic-btn-active' : ''} ${isRecording ? 'voice-agent-mic-btn-recording' : ''}`}
              onPointerDown={onMicPointerDown}
              onPointerUp={onMicPointerUp}
              onPointerLeave={engine === 'whisper-local' && isRecording ? onMicPointerUp : undefined}
              onClick={engine !== 'whisper-local' ? () => onToggle() : undefined}
              title={
                engine === 'whisper-local'
                  ? (isRecording ? t(locale, 'transcription.voiceWidget.mic.releaseToStop') : t(locale, 'transcription.voiceWidget.mic.holdToTalk'))
                  : (listening ? t(locale, 'transcription.voiceWidget.mic.stopHotkey') : t(locale, 'transcription.voiceWidget.mic.startHotkey'))
              }
              aria-label={listening ? t(locale, 'transcription.voiceWidget.mic.stopAria') : t(locale, 'transcription.voiceWidget.mic.startAria')}
              aria-pressed={listening}
            >
              {isRecording ? <Mic size={22} /> : (listening ? <Mic size={22} /> : <MicOff size={22} />)}
            </button>
            <div className="voice-agent-header-copy">
              <div className="voice-agent-status-line" role="status" aria-label={t(locale, 'transcription.voiceWidget.status.current')}>
                <span className={`voice-agent-state-badge voice-agent-state-badge-${agentState}`}>{agentStateLabel}</span>
                {statusSummary}
              </div>
              <div className="voice-agent-environment-line" title={environmentSummary}>
                {environmentSummary}
              </div>
            </div>
            <button
              type="button"
              className={`voice-agent-disclosure-toggle ${showSettings ? 'is-open' : ''}`}
              onClick={() => setShowSettings((value) => !value)}
              aria-expanded={showSettings}
              aria-label={t(locale, 'transcription.voiceWidget.settings.toggle')}
            >
              <SlidersHorizontal size={15} />
              <span>{t(locale, 'transcription.voiceWidget.settings.button')}</span>
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="voice-agent-mode-bar" role="radiogroup" aria-label={t(locale, 'ai.assistantHub.voiceMode')}>
            {MODE_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`voice-agent-mode-btn ${mode === m ? 'voice-agent-mode-btn-active' : ''}`}
                onClick={() => onSwitchMode(m)}
              >
                {modeLabels[m]}
              </button>
            ))}
          </div>
        </div>

        <div className={`voice-agent-session-card voice-agent-session-card-${mode} ${listening ? 'is-live' : 'is-idle'} ${isSessionEmpty ? 'is-empty' : 'has-content'}`} style={confidenceStyle}>
          <div className="voice-agent-session-heading">
            <span className="voice-agent-session-kicker">{workspaceLabel}</span>
            <span className="voice-agent-session-note">{listening ? sessionHint : processSummary}</span>
          </div>

          <div className="voice-agent-session-meta">
            <span className={`voice-agent-session-badge voice-agent-session-badge-${mode}`}>
              {modeLabels[mode]}
            </span>
            {isRecording && (
              <div className="voice-agent-recording-indicator" aria-live="polite">
                <span className="voice-agent-recording-dot" aria-hidden="true" />
                <span className="voice-agent-recording-time">
                  {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
                </span>
              </div>
            )}
            {listening && engine === 'web-speech' && (
              <div className="voice-agent-session-signal-group">
                <span className={`voice-agent-vad-dot ${speechActive ? 'voice-agent-vad-dot-active' : ''}`} title={speechActive ? t(locale, 'transcription.voiceWidget.signal.speaking') : t(locale, 'transcription.voiceWidget.signal.silent')} />
                <div
                  className="voice-agent-energy-bar"
                  title={tf(locale, 'transcription.voiceWidget.signal.volume', { percent: Math.round(energyLevel * 500) })}
                  aria-label={tf(locale, 'transcription.voiceWidget.signal.volume', { percent: Math.round(energyLevel * 500) })}
                >
                  <div
                    className="voice-agent-energy-fill"
                    style={{ width: `${Math.min(100, energyLevel * 500)}%` }}
                  />
                </div>
              </div>
            )}
            {langOverride === '__auto__' && detectedLang && (
              <span className="voice-agent-session-chip" title={tf(locale, 'transcription.voiceWidget.detectedLanguage', { lang: detectedLang })}>
                {detectedLang}
              </span>
            )}
            {confidence > 0 && (
              <span className="voice-agent-confidence" style={{ color: confidenceColor }}>
                {Math.round(confidence * 100)}%
              </span>
            )}
          </div>

          <div className={`voice-agent-session-body ${interimText ? 'voice-agent-interim' : 'voice-agent-final'} ${isSessionEmpty ? 'is-placeholder' : ''}`}>
            <span
              className="voice-agent-session-body-text"
              {...(sessionTextPreviewProps?.dir ? { dir: sessionTextPreviewProps.dir } : {})}
              {...(sessionTextPreviewProps?.style ? { style: sessionTextPreviewProps.style } : {})}
            >
              {sessionText}
            </span>
          </div>

          <div className="voice-agent-session-grid">
            <div className="voice-agent-session-cell">
              <span className="voice-agent-session-target-label">{sessionTargetLabel}</span>
              <span className="voice-agent-session-target-value">{targetSummary}</span>
            </div>
            <div className="voice-agent-session-cell">
              <span className="voice-agent-session-target-label">{processLabel}</span>
              <span className="voice-agent-session-target-value">{processSummary}</span>
            </div>
            <div className="voice-agent-session-cell">
              <span className="voice-agent-session-target-label">{detailLabel}</span>
              <span className="voice-agent-session-target-value">{detailSummary}</span>
            </div>
          </div>
        </div>

        {(disambiguationOptions.length > 0 || pendingConfirm || error) && (
          <div className="voice-agent-notice-stack">
            {disambiguationOptions.length > 0 && (
              <div className="voice-agent-confirm voice-agent-disambiguation" role="alertdialog" aria-label={t(locale, 'transcription.voiceWidget.disambiguation.aria')}>
                <div className="voice-agent-confirm-copy">
                  <span className="voice-agent-confirm-label">{t(locale, 'transcription.voiceWidget.disambiguation.label')}</span>
                  <span className="voice-agent-confirm-fuzzy">{t(locale, 'transcription.voiceWidget.disambiguation.badge')}</span>
                </div>
                <div className="voice-agent-disambiguation-options">
                  {disambiguationOptions.map((option) => (
                    <button
                      key={option.actionId}
                      type="button"
                      className="voice-agent-disambiguation-option"
                      onClick={() => onSelectDisambiguation(option.actionId)}
                    >
                      <span>{getActionLabel(option.actionId, locale)}</span>
                      <span className="voice-agent-disambiguation-score">{Math.round(option.confidence * 100)}%</span>
                    </button>
                  ))}
                </div>
                <div className="voice-agent-confirm-actions">
                  <button
                    type="button"
                    className="voice-agent-confirm-btn voice-agent-confirm-no"
                    onClick={onDismissDisambiguation}
                    aria-label={t(locale, 'transcription.voiceWidget.disambiguation.cancelAria')}
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
            )}

            {pendingConfirm && (
              <div className="voice-agent-confirm" role="alertdialog" aria-label={t(locale, 'transcription.voiceWidget.confirm.aria')}>
                <div className="voice-agent-confirm-copy">
                  <span className="voice-agent-confirm-label">
                    {tf(locale, 'transcription.voiceWidget.confirm.prompt', { label: pendingConfirm.label })}
                  </span>
                  {pendingConfirm.fromFuzzy && (
                    <span className="voice-agent-confirm-fuzzy">{t(locale, 'ai.assistantHub.fuzzyMatch')}</span>
                  )}
                </div>
                <div className="voice-agent-confirm-actions">
                  <button
                    type="button"
                    className="voice-agent-confirm-btn voice-agent-confirm-yes"
                    onClick={onConfirm}
                    aria-label={t(locale, 'ai.assistantHub.confirm')}
                  >
                    <Check size={17} />
                  </button>
                  <button
                    type="button"
                    className="voice-agent-confirm-btn voice-agent-confirm-no"
                    onClick={onCancel}
                    aria-label={t(locale, 'ai.assistantHub.cancel')}
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="voice-agent-error" role="alert">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="voice-agent-disclosure-group">
          <section className={`voice-agent-disclosure ${showSettings ? 'is-open' : ''}`}>
            <button
              type="button"
              className="voice-agent-disclosure-header"
              onClick={() => setShowSettings((value) => !value)}
              aria-expanded={showSettings}
            >
              <span className="voice-agent-disclosure-title">{t(locale, 'transcription.voiceWidget.settings.title')}</span>
              <ChevronDown size={14} />
            </button>

            {showSettings && (
              <div className="voice-agent-disclosure-panel voice-agent-settings-panel">
                <div className="voice-agent-settings-grid">
                  <label className="voice-agent-field">
                    <span className="voice-agent-field-label">{t(locale, 'transcription.voiceWidget.settings.recognitionLanguage')}</span>
                    <select
                      className="voice-agent-lang-select"
                      value={langOverride ?? corpusLang}
                      onChange={(e) => onSetLangOverride(e.currentTarget.value)}
                      title={t(locale, 'transcription.voiceWidget.settings.recognitionLanguage')}
                      aria-label={t(locale, 'transcription.voiceWidget.settings.recognitionLanguage')}
                    >
                      <option value="__auto__">{t(locale, 'transcription.voiceWidget.settings.autoDetectOption')}</option>
                      {SUPPORTED_VOICE_LANGS.map((group) => (
                        <optgroup key={group.group} label={group.group}>
                          {group.langs.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>

                  <label className="voice-agent-field">
                    <span className="voice-agent-field-label">{t(locale, 'transcription.voiceWidget.settings.engine')}</span>
                    <select
                      className="voice-agent-engine-select"
                      value={engine}
                      onChange={(e) => onSwitchEngine(e.currentTarget.value as SttEngine)}
                      title={t(locale, 'transcription.voiceWidget.settings.engine')}
                      aria-label={t(locale, 'transcription.voiceWidget.settings.engine')}
                    >
                      <option value="web-speech">{t(locale, 'transcription.voiceWidget.engine.webSpeech')}</option>
                      <option value="whisper-local">{t(locale, 'transcription.voiceWidget.engine.whisperLocal')}</option>
                      <option value="commercial">{t(locale, 'transcription.voiceWidget.engine.commercial')}</option>
                    </select>
                  </label>
                </div>

                <div className="voice-agent-toggle-row">
                  <label className="voice-agent-safe-toggle" title={t(locale, 'transcription.voiceWidget.settings.safeModeTitle')}>
                    <input
                      type="checkbox"
                      checked={safeMode}
                      onChange={(e) => onSetSafeMode(e.target.checked)}
                    />
                    <span className="voice-agent-safe-label">{t(locale, 'ai.assistantHub.safeMode')}</span>
                  </label>

                  <label className="voice-agent-wakeword-toggle" title={t(locale, 'transcription.voiceWidget.settings.wakeWordTitle')}>
                    <input
                      type="checkbox"
                      checked={wakeWordEnabled}
                      onChange={(e) => onSetWakeWordEnabled(e.target.checked)}
                    />
                    <span className="voice-agent-wakeword-label">{t(locale, 'transcription.voiceWidget.settings.wakeWord')}</span>
                  </label>

                  {wakeWordEnabled && !listening && (
                    <div className="voice-agent-wakeword-energy" title={tf(locale, 'transcription.voiceWidget.signal.wakeEnergy', { percent: Math.round(wakeWordEnergyLevel * 500) })}>
                      <div
                        className="voice-agent-wakeword-energy-fill"
                        style={{ width: `${Math.min(100, wakeWordEnergyLevel * 500)}%` }}
                      />
                    </div>
                  )}
                </div>

                {showCommercialConfig && (
                  <div className="voice-agent-commercial-config">
                    <div className="voice-agent-commercial-provider-row">
                      <select
                        className="voice-agent-commercial-provider-select"
                        value={commercialProviderKind}
                        onChange={(e) => onSetCommercialProviderKind(e.currentTarget.value as CommercialProviderKind)}
                        title={t(locale, 'transcription.voiceWidget.settings.commercialProvider')}
                        aria-label={t(locale, 'transcription.voiceWidget.settings.commercialProvider')}
                      >
                        {commercialProviderDefinitions.map((def) => (
                          <option key={def.kind} value={def.kind}>
                            {def.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="voice-agent-config-actions">
                      <button
                        type="button"
                        className="icon-btn voice-agent-test-btn"
                        disabled={providerAvailability === 'testing'}
                        onClick={handleTestProvider}
                        title={t(locale, 'ai.chat.testConnection')}
                      >
                        {providerAvailability === 'testing' ? t(locale, 'ai.chat.testing') : t(locale, 'ai.chat.testConnection')}
                      </button>
                      {providerAvailability === 'available' && (
                        <span className="voice-agent-config-ok">
                          <Check size={12} /> {t(locale, 'transcription.voiceWidget.provider.available')}
                        </span>
                      )}
                      {providerAvailability === 'unavailable' && (
                        <span className="voice-agent-config-error" title={providerError ?? undefined}>
                          {t(locale, 'transcription.voiceWidget.provider.unavailable')}{providerError ? `: ${providerError}` : ''}
                        </span>
                      )}
                    </div>

                    <div className="voice-agent-commercial-fields">
                      {isVolcengine(commercialProviderKind) ? (
                        <>
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localAppId}
                            onChange={(e) => { const value = e.currentTarget.value; setLocalAppId(value); notifyConfigChange(localApiKey, localBaseUrl, localModel, value, localAccessToken); }}
                            placeholder={t(locale, 'transcription.voiceWidget.placeholder.appId')}
                            aria-label={t(locale, 'transcription.voiceWidget.label.appId')}
                          />
                          <input
                            className="voice-agent-commercial-input"
                            type="password"
                            value={localAccessToken}
                            onChange={(e) => { const value = e.currentTarget.value; setLocalAccessToken(value); notifyConfigChange(localApiKey, localBaseUrl, localModel, localAppId, value); }}
                            placeholder={t(locale, 'transcription.voiceWidget.label.accessToken')}
                            aria-label={t(locale, 'transcription.voiceWidget.label.accessToken')}
                          />
                        </>
                      ) : (
                        <>
                          <input
                            className="voice-agent-commercial-input"
                            type="password"
                            value={localApiKey}
                            onChange={(e) => { const value = e.currentTarget.value; setLocalApiKey(value); notifyConfigChange(value, localBaseUrl, localModel, localAppId, localAccessToken); }}
                            placeholder={commercialProviderKind === 'minimax' ? 'eyJ...' : 'sk-...'}
                            aria-label={t(locale, 'transcription.voiceWidget.label.apiKey')}
                          />
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localBaseUrl}
                            onChange={(e) => { const value = e.currentTarget.value; setLocalBaseUrl(value); notifyConfigChange(localApiKey, value, localModel, localAppId, localAccessToken); }}
                            placeholder={
                              commercialProviderKind === 'minimax'
                                ? t(locale, 'transcription.voiceWidget.placeholder.baseUrlMinimax')
                                : commercialProviderKind === 'groq'
                                  ? t(locale, 'transcription.voiceWidget.placeholder.baseUrlGroq')
                                  : t(locale, 'transcription.voiceWidget.placeholder.baseUrlOptional')
                            }
                            aria-label={t(locale, 'transcription.voiceWidget.label.baseUrl')}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={`voice-agent-disclosure ${showInsights ? 'is-open' : ''}`}>
            <button
              type="button"
              className="voice-agent-disclosure-header"
              onClick={() => setShowInsights((value) => !value)}
              aria-expanded={showInsights}
            >
              <span className="voice-agent-disclosure-title voice-agent-disclosure-title-with-icon">
                <History size={14} /> {t(locale, 'transcription.voiceWidget.insights.title')}
              </span>
              {insightCount > 0 && (
                <span className="voice-agent-learning-count">{insightCount}</span>
              )}
              <ChevronDown size={14} />
            </button>

            {showInsights && (
              <div className="voice-agent-disclosure-panel voice-agent-insights-panel">
                <div className="voice-agent-insights-tabs" role="tablist" aria-label={t(locale, 'transcription.voiceWidget.insights.tablist')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={insightTab === 'history'}
                    className={`voice-agent-insights-tab ${insightTab === 'history' ? 'is-active' : ''}`}
                    onClick={() => setInsightTab('history')}
                  >
                    <History size={13} /> {t(locale, 'transcription.voiceWidget.insights.historyTab')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={insightTab === 'learning'}
                    className={`voice-agent-insights-tab ${insightTab === 'learning' ? 'is-active' : ''}`}
                    onClick={() => setInsightTab('learning')}
                  >
                    <Brain size={13} /> {t(locale, 'transcription.voiceWidget.insights.learningTab')}
                  </button>
                </div>

                {insightTab === 'history' ? (
                  session.entries.length > 0 ? (
                    <ul className="voice-agent-history-list" aria-label={t(locale, 'transcription.voiceWidget.insights.historyAria')}>
                      {session.entries.slice(-8).reverse().map((entry, index) => (
                        <li key={`${entry.timestamp}-${index}`} className="voice-agent-history-entry">
                          <span className={`voice-agent-history-type voice-agent-history-type-${entry.intent.type}`}>
                            {entry.intent.type === 'action' && entry.intent.actionId
                              ? getActionLabel(entry.intent.actionId, locale)
                              : entry.intent.type === 'dictation'
                                ? t(locale, 'transcription.voiceWidget.intentType.dictation')
                                : entry.intent.type === 'tool'
                                  ? t(locale, 'transcription.voiceWidget.intentType.tool')
                                  : entry.intent.type === 'slot-fill'
                                    ? t(locale, 'transcription.voiceWidget.intentType.slotFill')
                                    : t(locale, 'transcription.voiceWidget.intentType.chat')}
                          </span>
                          <span
                            className="voice-agent-history-text"
                            title={entry.sttText}
                            {...(entry.intent.type === 'dictation' && dictationPreviewTextProps?.dir ? { dir: dictationPreviewTextProps.dir } : {})}
                            {...(entry.intent.type === 'dictation' && dictationPreviewTextProps?.style ? { style: dictationPreviewTextProps.style } : {})}
                          >
                            {entry.sttText.length > 24 ? `${entry.sttText.slice(0, 24)}…` : entry.sttText}
                          </span>
                          {entry.confidence > 0 && (
                            <span className="voice-agent-history-conf">
                              {Math.round(entry.confidence * 100)}%
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="voice-agent-learning-empty">{t(locale, 'transcription.voiceWidget.empty.history')}</div>
                  )
                ) : learningLogEntries.length === 0 ? (
                  <div className="voice-agent-learning-empty">{t(locale, 'transcription.voiceWidget.empty.learning')}</div>
                ) : (
                  <div className="voice-agent-learning-panel">
                    <div className="voice-agent-learning-panel-header">
                      <span>{tf(locale, 'transcription.voiceWidget.learning.header', { count: learningLogEntries.length })}</span>
                      <button
                        type="button"
                        className="voice-agent-learning-clear-btn"
                        onClick={() => { clearVoiceAliasLearningLog(); setLearningLogEntries([]); }}
                        title={t(locale, 'transcription.voiceWidget.learning.clear')}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <ul className="voice-agent-learning-list">
                      {learningLogEntries.slice().reverse().map((entry, index) => (
                        <li key={`${entry.phrase}-${index}`} className="voice-agent-learning-entry">
                          <span className="voice-agent-learning-phrase" title={entry.phrase}>
                            {entry.phrase.length > 18 ? `${entry.phrase.slice(0, 18)}…` : entry.phrase}
                          </span>
                          <span className="voice-agent-learning-arrow">→</span>
                          <span className="voice-agent-learning-action">
                            {getActionLabel(entry.actionId, locale)}
                          </span>
                          <span className={`voice-agent-learning-reason voice-agent-learning-reason-${entry.reason}`}>
                            {getVoiceAliasLearningReasonLabel(entry.reason, locale)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
});
