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
import type { SttEngine } from '../services/VoiceInputService';
import { commercialProviderDefinitions } from '../services/stt';
import type { CommercialProviderKind } from '../services/VoiceInputService';
import type { ActionIntent, VoiceIntent, VoiceSession } from '../services/IntentRouter';
import { getActionLabel, loadVoiceAliasLearningLog, clearVoiceAliasLearningLog, type VoiceAliasLearningLogEntry } from '../services/voiceIntentUi';

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

const MODE_LABELS: Record<VoiceAgentMode, string> = {
  command: '指令',
  dictation: '听写',
  analysis: '分析',
};

const MODE_ORDER: VoiceAgentMode[] = ['command', 'dictation', 'analysis'];

const MODE_HINTS: Record<VoiceAgentMode, { idle: string; active: string }> = {
  command: {
    idle: '识别后的语音会映射成界面操作。',
    active: '正在监听操作型语音指令。',
  },
  dictation: {
    idle: '听写结果会显示在这里，并写入当前目标位置。',
    active: '请直接说出要写入文本框的内容。',
  },
  analysis: {
    idle: '语音内容会发送给 AI 做进一步分析。',
    active: '请说出要交给 AI 分析的问题或说明。',
  },
};

const MODE_WORKSPACE_LABELS: Record<VoiceAgentMode, string> = {
  command: '操作控制台',
  dictation: '听写工作台',
  analysis: '分析入口',
};

const MODE_PROCESS_LABELS: Record<VoiceAgentMode, string> = {
  command: '识别后执行界面操作',
  dictation: '识别后直接写入当前目标',
  analysis: '识别后发送给 AI 分析',
};

const AGENT_STATE_LABELS: Record<VoiceAgentState['agentState'], string> = {
  idle: '待命',
  listening: '实时监听',
  routing: '理解中',
  executing: '执行中',
  'ai-thinking': 'AI 处理中',
};

// ── Helpers ──

function isVolcengine(kind: CommercialProviderKind): boolean {
  return kind === 'volcengine';
}

// ── Component ──

export const VoiceAgentWidget = memo(function VoiceAgentWidget(props: VoiceAgentWidgetProps) {
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
      setAriaAnnouncement(`错误：${error}`);
      return;
    }
    if (lastIntent?.type === 'action') {
      const label = getActionLabel(lastIntent.actionId as Parameters<typeof getActionLabel>[0]);
      setAriaAnnouncement(`已执行：${label}`);
    }
  }, [lastIntent, error]);

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
      setProviderError(cached.available ? null : (cached.error ?? 'Provider unavailable'));
      return;
    }
    setProviderAvailability('testing');
    setProviderError(null);
    const result = await onTestCommercialProvider();
    lastTestRef.current = { result, ts: Date.now() };
    setProviderAvailability(result.available ? 'available' : 'unavailable');
    setProviderError(result.available ? null : (result.error ?? 'Provider unavailable'));
  }, [onTestCommercialProvider]);

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

  const sessionHint = listening ? MODE_HINTS[mode].active : MODE_HINTS[mode].idle;
  const sessionText = displayText || sessionHint;
  const isSessionEmpty = displayText.length === 0;
  const sessionTargetLabel = mode === 'dictation'
    ? '写入到'
    : mode === 'analysis'
      ? '发送到'
      : '作用于';
  const processLabel = mode === 'dictation'
    ? '写入方式'
    : mode === 'analysis'
      ? '处理方式'
      : '执行方式';
  const detailLabel = mode === 'command' ? '最近意图' : '句段范围';
  const workspaceLabel = MODE_WORKSPACE_LABELS[mode];
  const processSummary = MODE_PROCESS_LABELS[mode];
  const lastIntentSummary = (() => {
    if (!lastIntent) return '暂无';
    switch (lastIntent.type) {
      case 'action':
        return getActionLabel(lastIntent.actionId);
      case 'dictation':
        return '文本写入';
      case 'tool':
        return lastIntent.toolName;
      case 'slot-fill':
        return `${lastIntent.slotName}: ${lastIntent.value}`;
      case 'chat':
      default:
        return lastIntent.text.length > 18 ? `${lastIntent.text.slice(0, 18)}…` : lastIntent.text || '暂无';
    }
  })();
  const detailSummary = mode === 'command' ? lastIntentSummary : selectionSummary;
  const insightCount = session.entries.length + learningLogEntries.length;
  const agentStateLabel = AGENT_STATE_LABELS[agentState];

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
                  ? (isRecording ? '松开结束录音' : '按住说话')
                  : (listening ? '关闭语音 (⌘⇧.)' : '开启语音 (⌘⇧.)')
              }
              aria-label={listening ? '关闭语音智能体' : '开启语音智能体'}
              aria-pressed={listening}
            >
              {isRecording ? <Mic size={22} /> : (listening ? <Mic size={22} /> : <MicOff size={22} />)}
            </button>
            <div className="voice-agent-header-copy">
              <div className="voice-agent-status-line" role="status" aria-label="当前状态">
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
              aria-label="切换语音设置"
            >
              <SlidersHorizontal size={15} />
              <span>设置</span>
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="voice-agent-mode-bar" role="radiogroup" aria-label="语音模式">
            {MODE_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`voice-agent-mode-btn ${mode === m ? 'voice-agent-mode-btn-active' : ''}`}
                onClick={() => onSwitchMode(m)}
              >
                {MODE_LABELS[m]}
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
              {MODE_LABELS[mode]}
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
                <span className={`voice-agent-vad-dot ${speechActive ? 'voice-agent-vad-dot-active' : ''}`} title={speechActive ? '检测到说话' : '静默'} />
                <div
                  className="voice-agent-energy-bar"
                  title={`音量 ${Math.round(energyLevel * 500)}%`}
                  aria-label={`音量 ${Math.round(energyLevel * 500)}%`}
                >
                  <div
                    className="voice-agent-energy-fill"
                    style={{ width: `${Math.min(100, energyLevel * 500)}%` }}
                  />
                </div>
              </div>
            )}
            {langOverride === '__auto__' && detectedLang && (
              <span className="voice-agent-session-chip" title={`检测到语言: ${detectedLang}`}>
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
            {sessionText}
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
              <div className="voice-agent-confirm voice-agent-disambiguation" role="alertdialog" aria-label="语音消歧候选">
                <div className="voice-agent-confirm-copy">
                  <span className="voice-agent-confirm-label">检测到低置信度指令，请选择更准确的操作</span>
                  <span className="voice-agent-confirm-fuzzy">需要消歧</span>
                </div>
                <div className="voice-agent-disambiguation-options">
                  {disambiguationOptions.map((option) => (
                    <button
                      key={option.actionId}
                      type="button"
                      className="voice-agent-disambiguation-option"
                      onClick={() => onSelectDisambiguation(option.actionId)}
                    >
                      <span>{getActionLabel(option.actionId)}</span>
                      <span className="voice-agent-disambiguation-score">{Math.round(option.confidence * 100)}%</span>
                    </button>
                  ))}
                </div>
                <div className="voice-agent-confirm-actions">
                  <button
                    type="button"
                    className="voice-agent-confirm-btn voice-agent-confirm-no"
                    onClick={onDismissDisambiguation}
                    aria-label="取消消歧"
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
            )}

            {pendingConfirm && (
              <div className="voice-agent-confirm" role="alertdialog" aria-label="语音操作确认">
                <div className="voice-agent-confirm-copy">
                  <span className="voice-agent-confirm-label">
                    确认执行「{pendingConfirm.label}」？
                  </span>
                  {pendingConfirm.fromFuzzy && (
                    <span className="voice-agent-confirm-fuzzy">模糊匹配</span>
                  )}
                </div>
                <div className="voice-agent-confirm-actions">
                  <button
                    type="button"
                    className="voice-agent-confirm-btn voice-agent-confirm-yes"
                    onClick={onConfirm}
                    aria-label="确认"
                  >
                    <Check size={17} />
                  </button>
                  <button
                    type="button"
                    className="voice-agent-confirm-btn voice-agent-confirm-no"
                    onClick={onCancel}
                    aria-label="取消"
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
              <span className="voice-agent-disclosure-title">语音设置</span>
              <ChevronDown size={14} />
            </button>

            {showSettings && (
              <div className="voice-agent-disclosure-panel voice-agent-settings-panel">
                <div className="voice-agent-settings-grid">
                  <label className="voice-agent-field">
                    <span className="voice-agent-field-label">识别语言</span>
                    <select
                      className="voice-agent-lang-select"
                      value={langOverride ?? corpusLang}
                      onChange={(e) => onSetLangOverride(e.currentTarget.value)}
                      title="语音识别语言"
                      aria-label="语音识别语言"
                    >
                      <option value="__auto__">🌐 自动检测</option>
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
                    <span className="voice-agent-field-label">STT 引擎</span>
                    <select
                      className="voice-agent-engine-select"
                      value={engine}
                      onChange={(e) => onSwitchEngine(e.currentTarget.value as SttEngine)}
                      title="STT 引擎"
                      aria-label="STT 引擎"
                    >
                      <option value="web-speech">Web Speech</option>
                      <option value="whisper-local">Ollama Whisper</option>
                      <option value="commercial">商业模型</option>
                    </select>
                  </label>
                </div>

                <div className="voice-agent-toggle-row">
                  <label className="voice-agent-safe-toggle" title="安全模式：破坏性操作需确认">
                    <input
                      type="checkbox"
                      checked={safeMode}
                      onChange={(e) => onSetSafeMode(e.target.checked)}
                    />
                    <span className="voice-agent-safe-label">安全模式</span>
                  </label>

                  <label className="voice-agent-wakeword-toggle" title="唤醒词检测：说任意词语自动启动语音助手">
                    <input
                      type="checkbox"
                      checked={wakeWordEnabled}
                      onChange={(e) => onSetWakeWordEnabled(e.target.checked)}
                    />
                    <span className="voice-agent-wakeword-label">语音唤醒</span>
                  </label>

                  {wakeWordEnabled && !listening && (
                    <div className="voice-agent-wakeword-energy" title={`唤醒能量 ${Math.round(wakeWordEnergyLevel * 500)}%`}>
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
                        title="商业 STT Provider"
                        aria-label="商业 STT Provider"
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
                        title="测试连接"
                      >
                        {providerAvailability === 'testing' ? '测试中…' : '测试连接'}
                      </button>
                      {providerAvailability === 'available' && (
                        <span className="voice-agent-config-ok">
                          <Check size={12} /> 可用
                        </span>
                      )}
                      {providerAvailability === 'unavailable' && (
                        <span className="voice-agent-config-error" title={providerError ?? undefined}>
                          不可用{providerError ? `: ${providerError}` : ''}
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
                            placeholder="App ID（火山引擎控制台）"
                            aria-label="App ID"
                          />
                          <input
                            className="voice-agent-commercial-input"
                            type="password"
                            value={localAccessToken}
                            onChange={(e) => { const value = e.currentTarget.value; setLocalAccessToken(value); notifyConfigChange(localApiKey, localBaseUrl, localModel, localAppId, value); }}
                            placeholder="Access Token"
                            aria-label="Access Token"
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
                            aria-label="API Key"
                          />
                          <input
                            className="voice-agent-commercial-input"
                            type="text"
                            value={localBaseUrl}
                            onChange={(e) => { const value = e.currentTarget.value; setLocalBaseUrl(value); notifyConfigChange(localApiKey, value, localModel, localAppId, localAccessToken); }}
                            placeholder={
                              commercialProviderKind === 'minimax'
                                ? 'https://api.minimax.chat/v1（留空默认）'
                                : commercialProviderKind === 'groq'
                                  ? '（留空使用 groq 官方）'
                                  : 'Base URL（可选）'
                            }
                            aria-label="Base URL"
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
                <History size={14} /> 记录
              </span>
              {insightCount > 0 && (
                <span className="voice-agent-learning-count">{insightCount}</span>
              )}
              <ChevronDown size={14} />
            </button>

            {showInsights && (
              <div className="voice-agent-disclosure-panel voice-agent-insights-panel">
                <div className="voice-agent-insights-tabs" role="tablist" aria-label="语音记录分类">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={insightTab === 'history'}
                    className={`voice-agent-insights-tab ${insightTab === 'history' ? 'is-active' : ''}`}
                    onClick={() => setInsightTab('history')}
                  >
                    <History size={13} /> 最近语音
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={insightTab === 'learning'}
                    className={`voice-agent-insights-tab ${insightTab === 'learning' ? 'is-active' : ''}`}
                    onClick={() => setInsightTab('learning')}
                  >
                    <Brain size={13} /> 学习记录
                  </button>
                </div>

                {insightTab === 'history' ? (
                  session.entries.length > 0 ? (
                    <ul className="voice-agent-history-list" aria-label="语音命令历史">
                      {session.entries.slice(-8).reverse().map((entry, index) => (
                        <li key={`${entry.timestamp}-${index}`} className="voice-agent-history-entry">
                          <span className={`voice-agent-history-type voice-agent-history-type-${entry.intent.type}`}>
                            {entry.intent.type === 'action' && entry.intent.actionId ? getActionLabel(entry.intent.actionId) : entry.intent.type}
                          </span>
                          <span className="voice-agent-history-text" title={entry.sttText}>
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
                    <div className="voice-agent-learning-empty">暂无最近语音记录</div>
                  )
                ) : learningLogEntries.length === 0 ? (
                  <div className="voice-agent-learning-empty">暂无学习记录</div>
                ) : (
                  <div className="voice-agent-learning-panel">
                    <div className="voice-agent-learning-panel-header">
                      <span>语音别名学习记录 ({learningLogEntries.length})</span>
                      <button
                        type="button"
                        className="voice-agent-learning-clear-btn"
                        onClick={() => { clearVoiceAliasLearningLog(); setLearningLogEntries([]); }}
                        title="清空学习记录"
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
                            {getActionLabel(entry.actionId)}
                          </span>
                          <span className={`voice-agent-learning-reason voice-agent-learning-reason-${entry.reason}`}>
                            {entry.reason === 'updated' ? '更新' : entry.reason === 'conflict' ? '冲突' : entry.reason === 'unchanged' ? '未变' : '新建'}
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
