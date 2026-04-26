/**
 * VoiceAgentWidget — 语音智能体 UI 组件
 *
 * 包含麦克风按钮、模式选择器、引擎选择器、商业 STT 配置面板和即时转写显示。
 *
 * @see 解语-语音智能体架构设计方案 §4.6
 */

import { memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import '../styles/panels/voice-agent.css';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE, JIEYU_MATERIAL_INLINE_TIGHT, JIEYU_MATERIAL_MICRO, JIEYU_MATERIAL_VOICE_MIC, JIEYU_MATERIAL_WAVE_MD, jieyuMaterialClass } from '../utils/jieyuMaterialIcon';
import type { VoiceAgentMode, VoiceAgentState, VoicePendingConfirm } from '../hooks/useVoiceAgent';
import { getConfidenceColor } from '../hooks/voiceAgentPresentation';
import { SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';
import type { SttEngine } from '../services/VoiceInputService';
import { getCompatibleSttEnhancements, hasCommercialCredentials, sttProviderDefinitions, type ProviderReachability, type SttEnhancementConfig, type SttEnhancementFailureKind, type SttEnhancementReachability, type SttEnhancementSelectionKind } from '../services/stt';
import { commercialProviderDefinitions } from '../services/stt/providerMetadata';
import type { CommercialProviderKind } from '../services/VoiceInputService';
import type { ActionIntent, VoiceIntent, VoiceSession } from '../services/IntentRouter';
import { t, tf, useLocale } from '../i18n';
import { clearVoiceAliasLearningLog, getActionLabel, getVoiceAliasLearningReasonLabel, loadVoiceAliasLearningLog, type VoiceAliasLearningLogEntry } from '../services/voiceIntentUi';
import { DialogShell, PanelButton, PanelChip } from './ui';

// ── Types ──

export interface VoiceAgentWidgetProps {
  compact?: boolean;
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
  providerStatusMap?: ProviderReachability[];
  enhancementStatus?: SttEnhancementReachability | null;
  onRefreshProviderStatus?: () => Promise<void>;
  localWhisperConfig?: { baseUrl?: string; model?: string };
  onLocalWhisperConfigChange?: (config: { baseUrl?: string; model?: string }) => void;
  sttEnhancementKind?: SttEnhancementSelectionKind;
  sttEnhancementConfig?: SttEnhancementConfig;
  onSttEnhancementKindChange?: (kind: SttEnhancementSelectionKind) => void;
  onSttEnhancementConfigChange?: (config: SttEnhancementConfig) => void;
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
  chat: 'ai.assistantHub.mode.chat',
  dictation: 'ai.assistantHub.mode.dictation',
} as const;

const MODE_ORDER: Array<'chat' | 'dictation'> = ['chat', 'dictation'];

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

function getProviderStatusTone(available: boolean | undefined): 'ok' | 'error' | 'idle' {
  if (available === true) return 'ok';
  if (available === false) return 'error';
  return 'idle';
}

function getProviderStatusLabel(locale: ReturnType<typeof useLocale>, available: boolean | undefined): string {
  if (available === true) return t(locale, 'transcription.voiceWidget.provider.available');
  if (available === false) return t(locale, 'transcription.voiceWidget.provider.unavailable');
  return t(locale, 'transcription.voiceWidget.provider.unknown');
}

function getEnhancementFailureKindLabel(locale: ReturnType<typeof useLocale>, errorKind: SttEnhancementFailureKind | undefined): string | null {
  switch (errorKind) {
    case 'missing-config':
      return t(locale, 'transcription.voiceWidget.enhancement.errorKind.missingConfig');
    case 'timeout':
      return t(locale, 'transcription.voiceWidget.enhancement.errorKind.timeout');
    case 'network':
      return t(locale, 'transcription.voiceWidget.enhancement.errorKind.network');
    case 'http':
      return t(locale, 'transcription.voiceWidget.enhancement.errorKind.http');
    case 'unknown':
      return t(locale, 'transcription.voiceWidget.enhancement.errorKind.unknown');
    default:
      return null;
  }
}

// ── Component ──

export const VoiceAgentWidget = memo(function VoiceAgentWidget(props: VoiceAgentWidgetProps) {
  const locale = useLocale();
  const {
    compact = false,
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
    providerStatusMap = [],
    enhancementStatus = null,
    onRefreshProviderStatus,
    localWhisperConfig,
    onLocalWhisperConfigChange,
    sttEnhancementKind = 'none',
    sttEnhancementConfig,
    onSttEnhancementKindChange,
    onSttEnhancementConfigChange,
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
  const energyFillPercent = Math.min(100, energyLevel * 500);
  const wakeWordEnergyFillPercent = Math.min(100, wakeWordEnergyLevel * 500);
  const energyGradientId = useId();
  const wakeWordEnergyGradientId = useId();

  const confidenceStyle: CSSProperties | undefined = confidenceColor
    ? { borderColor: confidenceColor, '--voice-agent-confidence-color': confidenceColor } as CSSProperties
    : undefined;

  const [showSettings, setShowSettings] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [insightTab, setInsightTab] = useState<'history' | 'learning'>('history');

  // Local state for commercial config fields (initialized from prop, synced via useEffect)
  const [localApiKey, setLocalApiKey] = useState('');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [localModel, setLocalModel] = useState('');
  const [localAppId, setLocalAppId] = useState('');
  const [localAccessToken, setLocalAccessToken] = useState('');
  const [localWhisperBaseUrl, setLocalWhisperBaseUrl] = useState('');
  const [localWhisperModel, setLocalWhisperModel] = useState('');
  const [localEnhancementEndpointUrl, setLocalEnhancementEndpointUrl] = useState('');
  const [localEnhancementModel, setLocalEnhancementModel] = useState('');
  const [localEnhancementLanguage, setLocalEnhancementLanguage] = useState('');
  const [providerAvailability, setProviderAvailability] = useState<'idle' | 'testing' | 'available' | 'unavailable'>('idle');
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerStatusRefreshing, setProviderStatusRefreshing] = useState(false);
  const [learningLogEntries, setLearningLogEntries] = useState<VoiceAliasLearningLogEntry[]>([]);
  /** Current ARIA live announcement text. */
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');
  const providerTestVersionRef = useRef(0);
  const providerTestMountedRef = useRef(true);

  // Load voice alias learning log on mount
  useEffect(() => {
    setLearningLogEntries(loadVoiceAliasLearningLog());
  }, []);

  useEffect(() => () => {
    providerTestMountedRef.current = false;
    providerTestVersionRef.current += 1;
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
    setLocalWhisperBaseUrl(localWhisperConfig?.baseUrl ?? '');
    setLocalWhisperModel(localWhisperConfig?.model ?? '');
    setLocalEnhancementEndpointUrl(sttEnhancementConfig?.endpointUrl ? String(sttEnhancementConfig.endpointUrl) : '');
    setLocalEnhancementModel(sttEnhancementConfig?.model ? String(sttEnhancementConfig.model) : '');
    setLocalEnhancementLanguage(sttEnhancementConfig?.language ? String(sttEnhancementConfig.language) : '');
    setProviderAvailability('idle');
    setProviderError(null);
    providerTestVersionRef.current += 1;
    lastTestRef.current = null; // invalidate cached test result
  }, [
    commercialProviderKind,
    commercialProviderConfig.apiKey,
    commercialProviderConfig.baseUrl,
    commercialProviderConfig.model,
    commercialProviderConfig.appId,
    commercialProviderConfig.accessToken,
    localWhisperConfig?.baseUrl,
    localWhisperConfig?.model,
    sttEnhancementKind,
    sttEnhancementConfig?.endpointUrl,
    sttEnhancementConfig?.model,
    sttEnhancementConfig?.language,
  ]);

  useEffect(() => {
    if (!showSettings || !onRefreshProviderStatus) return;
    let cancelled = false;
    setProviderStatusRefreshing(true);
    void onRefreshProviderStatus().finally(() => {
      if (!cancelled) {
        setProviderStatusRefreshing(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onRefreshProviderStatus, showSettings]);

  const handleTestProvider = useCallback(async () => {
    const unavailableLabel = t(locale, 'transcription.voiceWidget.provider.unavailable');
    // Return cached result if still fresh
    if (lastTestRef.current && Date.now() - lastTestRef.current.ts < CACHE_TTL_MS) {
      const cached = lastTestRef.current.result;
      setProviderAvailability(cached.available ? 'available' : 'unavailable');
      setProviderError(cached.available ? null : (cached.error ?? unavailableLabel));
      return;
    }
    const requestVersion = ++providerTestVersionRef.current;
    setProviderAvailability('testing');
    setProviderError(null);
    try {
      const result = await onTestCommercialProvider();
      if (!providerTestMountedRef.current || requestVersion !== providerTestVersionRef.current) {
        return;
      }
      lastTestRef.current = { result, ts: Date.now() };
      setProviderAvailability(result.available ? 'available' : 'unavailable');
      setProviderError(result.available ? null : (result.error ?? unavailableLabel));
    } catch (error) {
      if (!providerTestMountedRef.current || requestVersion !== providerTestVersionRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : unavailableLabel;
      setProviderAvailability('unavailable');
      setProviderError(message || unavailableLabel);
    }
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

  const notifyLocalWhisperConfigChange = (baseUrl: string, model: string) => {
    onLocalWhisperConfigChange?.({ baseUrl, model });
  };

  const notifyEnhancementConfigChange = (endpointUrl: string, model: string, language: string) => {
    onSttEnhancementConfigChange?.({ endpointUrl, model, language });
  };

  const handleRefreshProviderStatus = useCallback(async () => {
    if (!onRefreshProviderStatus) return;
    setProviderStatusRefreshing(true);
    try {
      await onRefreshProviderStatus();
    } finally {
      setProviderStatusRefreshing(false);
    }
  }, [onRefreshProviderStatus]);

  const nonDictationMode: Exclude<VoiceAgentMode, 'dictation'> = mode === 'analysis' ? 'analysis' : 'command';
  const selectedMode: 'chat' | 'dictation' = mode === 'dictation' ? 'dictation' : 'chat';
  const modeLabels: Record<'chat' | 'dictation', string> = {
    chat: t(locale, MODE_LABEL_KEYS.chat),
    dictation: t(locale, MODE_LABEL_KEYS.dictation),
  };

  const handleSwitchMode = (targetMode: 'chat' | 'dictation') => {
    if (targetMode === 'dictation') {
      onSwitchMode('dictation');
      return;
    }
    onSwitchMode(nonDictationMode);
  };

  const isNonDictationMode = mode !== 'dictation';
  const sessionHint = listening
    ? t(locale, isNonDictationMode ? MODE_HINT_KEYS.analysis.active : MODE_HINT_KEYS.dictation.active)
    : t(locale, isNonDictationMode ? MODE_HINT_KEYS.analysis.idle : MODE_HINT_KEYS.dictation.idle);
  const sessionText = displayText || sessionHint;
  const isSessionEmpty = displayText.length === 0;
  const sessionTextPreviewProps = mode === 'dictation' && !isSessionEmpty ? dictationPreviewTextProps : undefined;
  const sessionTargetLabel = isNonDictationMode
    ? t(locale, 'transcription.voiceWidget.targetLabel.analysis')
    : t(locale, 'transcription.voiceWidget.targetLabel.dictation');
  const processLabel = isNonDictationMode
    ? t(locale, 'transcription.voiceWidget.processLabel.analysis')
    : t(locale, 'transcription.voiceWidget.processLabel.dictation');
  const detailLabel = isNonDictationMode
    ? t(locale, 'transcription.voiceWidget.detailLabel.range')
    : t(locale, 'transcription.voiceWidget.detailLabel.command');
  const workspaceLabel = t(locale, isNonDictationMode ? MODE_WORKSPACE_LABEL_KEYS.analysis : MODE_WORKSPACE_LABEL_KEYS.dictation);
  const processSummary = t(locale, isNonDictationMode ? MODE_PROCESS_LABEL_KEYS.analysis : MODE_PROCESS_LABEL_KEYS.dictation);
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
  const detailSummary = isNonDictationMode ? selectionSummary : lastIntentSummary;
  const insightCount = session.entries.length + learningLogEntries.length;
  const agentStateLabel = t(locale, AGENT_STATE_LABEL_KEYS[agentState]);
  const showProviderConfig = showSettings && (engine === 'commercial' || engine === 'whisper-local');
  const compatibleEnhancements = getCompatibleSttEnhancements(engine);
  const providerStatuses = sttProviderDefinitions.map((definition) => {
    const status = providerStatusMap.find((entry) => entry.kind === definition.kind);
    return {
      ...definition,
      available: status?.available,
      error: status?.error,
    };
  });
  const selectedEnhancementDefinition = sttEnhancementKind === 'none'
    ? null
    : compatibleEnhancements.find((definition) => definition.kind === sttEnhancementKind) ?? null;
  const enhancementStatusTone = selectedEnhancementDefinition
    ? getProviderStatusTone(enhancementStatus?.available)
    : 'idle';
  const enhancementStatusText = selectedEnhancementDefinition
    ? getProviderStatusLabel(locale, enhancementStatus?.available)
    : null;
  const enhancementFailureKindLabel = selectedEnhancementDefinition
    ? getEnhancementFailureKindLabel(locale, enhancementStatus?.errorKind)
    : null;

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
              {isRecording ? <MaterialSymbol name="mic" className={JIEYU_MATERIAL_VOICE_MIC} /> : (listening ? <MaterialSymbol name="mic" className={JIEYU_MATERIAL_VOICE_MIC} /> : <MaterialSymbol name="mic_off" className={JIEYU_MATERIAL_VOICE_MIC} />)}
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
            {!compact && (
              <button
                type="button"
                className={`voice-agent-disclosure-toggle ${showSettings ? 'is-open' : ''}`}
                onClick={() => setShowSettings((value) => !value)}
                aria-expanded={showSettings}
                aria-label={t(locale, 'transcription.voiceWidget.settings.toggle')}
              >
                <MaterialSymbol name="tune" className={JIEYU_MATERIAL_WAVE_MD} />
                <span>{t(locale, 'transcription.voiceWidget.settings.button')}</span>
                <MaterialSymbol name="expand_more" className={JIEYU_MATERIAL_INLINE} />
              </button>
            )}
          </div>

          <div className="voice-agent-mode-bar" role="radiogroup" aria-label={t(locale, 'ai.assistantHub.voiceMode')}>
            {MODE_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={selectedMode === m}
                className={`voice-agent-mode-btn ${selectedMode === m ? 'voice-agent-mode-btn-active' : ''}`}
                onClick={() => handleSwitchMode(m)}
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
              {modeLabels[selectedMode]}
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
                  <svg className="voice-agent-energy-meter" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id={energyGradientId} x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="var(--state-success-solid)" />
                        <stop offset="60%" stopColor="var(--state-warning-solid)" />
                        <stop offset="100%" stopColor="var(--state-danger-solid)" />
                      </linearGradient>
                    </defs>
                    <rect className="voice-agent-energy-fill" x={0} y={0} width={energyFillPercent} height={6} rx={3} ry={3} fill={`url(#${energyGradientId})`} />
                  </svg>
                </div>
              </div>
            )}
            {langOverride === '__auto__' && detectedLang && (
              <span className="voice-agent-session-chip" title={tf(locale, 'transcription.voiceWidget.detectedLanguage', { lang: detectedLang })}>
                {detectedLang}
              </span>
            )}
            {confidence > 0 && (
              <span className="voice-agent-confidence">
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
              <DialogShell
                className="voice-agent-confirm voice-agent-disambiguation"
                compact
                role="alertdialog"
                aria-label={t(locale, 'transcription.voiceWidget.disambiguation.aria')}
                headerClassName="voice-agent-confirm-header"
                bodyClassName="voice-agent-confirm-body"
                footerClassName="voice-agent-confirm-actions"
                title={t(locale, 'transcription.voiceWidget.disambiguation.aria')}
                actions={<PanelChip variant="warning" className="voice-agent-confirm-fuzzy">{t(locale, 'transcription.voiceWidget.disambiguation.badge')}</PanelChip>}
                footer={(
                  <PanelButton
                    variant="ghost"
                    className="voice-agent-confirm-btn voice-agent-confirm-no"
                    onClick={onDismissDisambiguation}
                    aria-label={t(locale, 'transcription.voiceWidget.disambiguation.cancelAria')}
                  >
                    {t(locale, 'ai.assistantHub.cancel')}
                  </PanelButton>
                )}
              >
                  <p className="voice-agent-confirm-label">{t(locale, 'transcription.voiceWidget.disambiguation.label')}</p>
                  <div className="voice-agent-disambiguation-options">
                  {disambiguationOptions.map((option) => (
                    <PanelButton
                      key={option.actionId}
                      className="voice-agent-disambiguation-option"
                      onClick={() => onSelectDisambiguation(option.actionId)}
                    >
                      <span>{getActionLabel(option.actionId, locale)}</span>
                      <span className="voice-agent-disambiguation-score">{Math.round(option.confidence * 100)}%</span>
                    </PanelButton>
                  ))}
                </div>
              </DialogShell>
            )}

            {pendingConfirm && (
              <DialogShell
                className="voice-agent-confirm"
                compact
                role="alertdialog"
                aria-label={t(locale, 'transcription.voiceWidget.confirm.aria')}
                headerClassName="voice-agent-confirm-header"
                bodyClassName="voice-agent-confirm-body"
                footerClassName="voice-agent-confirm-actions"
                title={t(locale, 'transcription.voiceWidget.confirm.aria')}
                actions={pendingConfirm.fromFuzzy ? <PanelChip variant="warning" className="voice-agent-confirm-fuzzy">{t(locale, 'ai.assistantHub.fuzzyMatch')}</PanelChip> : undefined}
                footer={(
                  <>
                    <PanelButton
                      variant="primary"
                      className="voice-agent-confirm-btn voice-agent-confirm-yes"
                      onClick={onConfirm}
                      aria-label={t(locale, 'ai.assistantHub.confirm')}
                    >
                      {t(locale, 'ai.assistantHub.confirm')}
                    </PanelButton>
                    <PanelButton
                      variant="ghost"
                      className="voice-agent-confirm-btn voice-agent-confirm-no"
                      onClick={onCancel}
                      aria-label={t(locale, 'ai.assistantHub.cancel')}
                    >
                      {t(locale, 'ai.assistantHub.cancel')}
                    </PanelButton>
                  </>
                )}
              >
                  <p className="voice-agent-confirm-label">
                    {tf(locale, 'transcription.voiceWidget.confirm.prompt', { label: pendingConfirm.label })}
                  </p>
              </DialogShell>
            )}

            {error && (
              <div className="voice-agent-error" role="alert">
                {error}
              </div>
            )}
          </div>
        )}

        {!compact && (
          <div className="voice-agent-disclosure-group">
          <section className={`voice-agent-disclosure ${showSettings ? 'is-open' : ''}`}>
            <button
              type="button"
              className="voice-agent-disclosure-header"
              onClick={() => setShowSettings((value) => !value)}
              aria-expanded={showSettings}
            >
              <span className="voice-agent-disclosure-title">{t(locale, 'transcription.voiceWidget.settings.title')}</span>
              <MaterialSymbol name="expand_more" className={JIEYU_MATERIAL_INLINE} />
            </button>

            {showSettings && (
              <div className="voice-agent-disclosure-panel voice-agent-settings-panel">
                <div className="voice-agent-settings-grid">
                  <label className="voice-agent-field">
                    <span className="voice-agent-field-label">{t(locale, 'transcription.voiceWidget.settings.recognitionLanguage')}</span>
                    <select
                      className="voice-agent-lang-select select-caret"
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
                      className="voice-agent-engine-select select-caret"
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
                  {engine === 'commercial' && !hasCommercialCredentials(commercialProviderConfig) && (
                    <p className="voice-agent-commercial-credentials-hint" role="status">
                      {t(locale, 'transcription.voiceWidget.settings.commercialCredentialsHint')}
                    </p>
                  )}
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
                      <svg className="voice-agent-energy-meter" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                        <defs>
                          <linearGradient id={wakeWordEnergyGradientId} x1="0" x2="1" y1="0" y2="0">
                            <stop offset="0%" stopColor="var(--state-info-solid)" />
                            <stop offset="100%" stopColor="color-mix(in srgb, var(--state-info-solid) 70%, var(--surface-panel))" />
                          </linearGradient>
                        </defs>
                        <rect className="voice-agent-wakeword-energy-fill" x={0} y={0} width={wakeWordEnergyFillPercent} height={6} rx={3} ry={3} fill={`url(#${wakeWordEnergyGradientId})`} />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="voice-agent-provider-overview">
                  <div className="voice-agent-provider-overview-header">
                    <span className="voice-agent-field-label">{t(locale, 'transcription.voiceWidget.settings.providerHealth')}</span>
                    <button
                      type="button"
                      className="icon-btn voice-agent-provider-refresh-btn"
                      disabled={providerStatusRefreshing || !onRefreshProviderStatus}
                      onClick={handleRefreshProviderStatus}
                    >
                      <MaterialSymbol name="refresh" className={jieyuMaterialClass(JIEYU_MATERIAL_MICRO, providerStatusRefreshing ? 'voice-agent-provider-refresh-icon spinning' : 'voice-agent-provider-refresh-icon')} />
                      <span>{providerStatusRefreshing ? t(locale, 'ai.chat.testing') : t(locale, 'transcription.voiceWidget.settings.refreshProviders')}</span>
                    </button>
                  </div>
                  <div className="voice-agent-provider-status-list">
                    {providerStatuses.map((provider) => {
                      const statusTone = getProviderStatusTone(provider.available);
                      return (
                        <div key={provider.kind} className="voice-agent-provider-status-item" title={provider.error ?? provider.description}>
                          <span className={`voice-agent-provider-status-dot voice-agent-provider-status-dot-${statusTone}`} aria-hidden="true" />
                          <span className="voice-agent-provider-status-name">{provider.label}</span>
                          <span className="voice-agent-provider-status-text">{getProviderStatusLabel(locale, provider.available)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {showProviderConfig && (
                  <div className="voice-agent-commercial-config">
                    {engine === 'commercial' && (
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
                    )}

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
                          <MaterialSymbol name="check" className={JIEYU_MATERIAL_MICRO} /> {t(locale, 'transcription.voiceWidget.provider.available')}
                        </span>
                      )}
                      {providerAvailability === 'unavailable' && (
                        <span className="voice-agent-config-error" title={providerError ?? undefined}>
                          {t(locale, 'transcription.voiceWidget.provider.unavailable')}{providerError ? `: ${providerError}` : ''}
                        </span>
                      )}
                    </div>

                    <form
                      className="voice-agent-commercial-fields"
                      onSubmit={(event) => event.preventDefault()}
                    >
                      {engine === 'whisper-local' ? (
                        <>
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localWhisperBaseUrl}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setLocalWhisperBaseUrl(value);
                              notifyLocalWhisperConfigChange(value, localWhisperModel);
                            }}
                            placeholder={t(locale, 'transcription.voiceWidget.placeholder.baseUrlOptional')}
                            aria-label={t(locale, 'transcription.voiceWidget.label.baseUrl')}
                          />
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localWhisperModel}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setLocalWhisperModel(value);
                              notifyLocalWhisperConfigChange(localWhisperBaseUrl, value);
                            }}
                            placeholder={t(locale, 'transcription.voiceWidget.placeholder.whisperModel')}
                            aria-label={t(locale, 'transcription.voiceWidget.label.model')}
                          />
                        </>
                      ) : isVolcengine(commercialProviderKind) ? (
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
                    </form>
                  </div>
                )}

                {engine !== 'web-speech' && (
                  <div className="voice-agent-enhancement-config">
                    <label className="voice-agent-field">
                      <span className="voice-agent-field-label">{t(locale, 'transcription.voiceWidget.settings.enhancement')}</span>
                      <select
                        className="voice-agent-commercial-provider-select"
                        value={sttEnhancementKind}
                        onChange={(e) => onSttEnhancementKindChange?.(e.currentTarget.value as SttEnhancementSelectionKind)}
                        aria-label={t(locale, 'transcription.voiceWidget.settings.enhancement')}
                      >
                        <option value="none">{t(locale, 'transcription.voiceWidget.settings.enhancementNone')}</option>
                        {compatibleEnhancements.map((definition) => (
                          <option key={definition.kind} value={definition.kind}>
                            {definition.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {sttEnhancementKind !== 'none' && (
                      <>
                        {selectedEnhancementDefinition && (
                          <div className="voice-agent-provider-overview voice-agent-enhancement-overview">
                            <div className="voice-agent-provider-overview-header">
                              <span className="voice-agent-field-label">{t(locale, 'transcription.voiceWidget.settings.enhancementHealth')}</span>
                            </div>
                            <div className="voice-agent-provider-status-list">
                              <div className="voice-agent-provider-status-item" title={enhancementStatus?.error ?? selectedEnhancementDefinition.description}>
                                <span className={`voice-agent-provider-status-dot voice-agent-provider-status-dot-${enhancementStatusTone}`} aria-hidden="true" />
                                <span className="voice-agent-provider-status-name">{selectedEnhancementDefinition.label}</span>
                                <span className="voice-agent-provider-status-text">{enhancementStatusText}</span>
                              </div>
                            </div>
                            <div className="voice-agent-provider-status-note">
                              <span>{t(locale, 'transcription.voiceWidget.enhancement.externalHint')}</span>
                              {enhancementFailureKindLabel ? <span>{enhancementFailureKindLabel}</span> : null}
                              {enhancementStatus?.error ? <span>{enhancementStatus.error}</span> : null}
                            </div>
                          </div>
                        )}
                        <div className="voice-agent-commercial-fields">
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localEnhancementEndpointUrl}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setLocalEnhancementEndpointUrl(value);
                              notifyEnhancementConfigChange(value, localEnhancementModel, localEnhancementLanguage);
                            }}
                            placeholder={t(locale, 'transcription.voiceWidget.placeholder.enhancementEndpoint')}
                            aria-label={t(locale, 'transcription.voiceWidget.label.endpointUrl')}
                          />
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localEnhancementModel}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setLocalEnhancementModel(value);
                              notifyEnhancementConfigChange(localEnhancementEndpointUrl, value, localEnhancementLanguage);
                            }}
                            placeholder={t(locale, 'transcription.voiceWidget.placeholder.enhancementModel')}
                            aria-label={t(locale, 'transcription.voiceWidget.label.model')}
                          />
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localEnhancementLanguage}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setLocalEnhancementLanguage(value);
                              notifyEnhancementConfigChange(localEnhancementEndpointUrl, localEnhancementModel, value);
                            }}
                            placeholder={t(locale, 'transcription.voiceWidget.placeholder.enhancementLanguage')}
                            aria-label={t(locale, 'transcription.voiceWidget.label.language')}
                          />
                        </div>
                      </>
                    )}
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
                <MaterialSymbol name="history" className={JIEYU_MATERIAL_INLINE} /> {t(locale, 'transcription.voiceWidget.insights.title')}
              </span>
              {insightCount > 0 && (
                <span className="voice-agent-learning-count">{insightCount}</span>
              )}
              <MaterialSymbol name="expand_more" className={JIEYU_MATERIAL_INLINE} />
            </button>

            {showInsights && (
              <div className="voice-agent-disclosure-panel voice-agent-insights-panel">
                <div className="voice-agent-insights-tabs panel-edge-nav panel-edge-nav--inline" role="tablist" aria-label={t(locale, 'transcription.voiceWidget.insights.tablist')}>
                  <div className={`panel-edge-nav-row ${insightTab === 'history' ? 'panel-edge-nav-row-active' : ''}`.trim()}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={insightTab === 'history'}
                      className={`voice-agent-insights-tab panel-edge-nav-btn ${insightTab === 'history' ? 'is-active' : ''}`}
                      onClick={() => setInsightTab('history')}
                    >
                      <MaterialSymbol name="history" className={JIEYU_MATERIAL_INLINE_TIGHT} />
                      <span className="panel-edge-nav-label"><strong className="panel-edge-nav-title">{t(locale, 'transcription.voiceWidget.insights.historyTab')}</strong></span>
                    </button>
                  </div>
                  <div className={`panel-edge-nav-row ${insightTab === 'learning' ? 'panel-edge-nav-row-active' : ''}`.trim()}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={insightTab === 'learning'}
                      className={`voice-agent-insights-tab panel-edge-nav-btn ${insightTab === 'learning' ? 'is-active' : ''}`}
                      onClick={() => setInsightTab('learning')}
                    >
                      <MaterialSymbol name="psychology" className={JIEYU_MATERIAL_INLINE_TIGHT} />
                      <span className="panel-edge-nav-label"><strong className="panel-edge-nav-title">{t(locale, 'transcription.voiceWidget.insights.learningTab')}</strong></span>
                    </button>
                  </div>
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
                        <MaterialSymbol name="close" className={JIEYU_MATERIAL_MICRO} />
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
        )}
      </div>
    </div>
  );
});
