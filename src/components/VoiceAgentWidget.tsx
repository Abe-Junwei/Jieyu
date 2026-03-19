/**
 * VoiceAgentWidget — 语音智能体 UI 组件
 *
 * 包含麦克风按钮、模式选择器、引擎选择器、商业 STT 配置面板和即时转写显示。
 *
 * @see 解语-语音智能体架构设计方案 §4.6
 */

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Mic, MicOff, Check, X, History } from 'lucide-react';
import { getConfidenceColor, type VoiceAgentMode, type VoiceAgentState } from '../hooks/useVoiceAgent';
import { SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import type { SttEngine } from '../services/VoiceInputService';
import { commercialProviderDefinitions } from '../services/stt';
import type { CommercialProviderKind } from '../services/VoiceInputService';
import type { VoiceSession } from '../services/IntentRouter';
import { getActionLabel, type VoiceIntent } from '../services/IntentRouter';

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
  pendingConfirm: { actionId: string; label: string } | null;
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
  onToggle: (mode?: VoiceAgentMode) => void;
  onMicPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp?: () => void;
  onSwitchMode: (mode: VoiceAgentMode) => void;
  onSwitchEngine: (engine: SttEngine) => void;
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
    onToggle,
    onMicPointerDown,
    onMicPointerUp,
    onSwitchMode,
    onSwitchEngine,
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

  const showCommercialConfig = listening && engine === 'commercial';

  // Local state for commercial config fields (initialized from prop, synced via useEffect)
  const [localApiKey, setLocalApiKey] = useState('');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [localModel, setLocalModel] = useState('');
  const [localAppId, setLocalAppId] = useState('');
  const [localAccessToken, setLocalAccessToken] = useState('');
  const [providerAvailability, setProviderAvailability] = useState<'idle' | 'testing' | 'available' | 'unavailable'>('idle');
  const [providerError, setProviderError] = useState<string | null>(null);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  /** Current ARIA live announcement text. */
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');

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

  return (
    <div className="voice-agent-widget">
      {/* ARIA live region for command execution announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="voice-agent-aria-live"
        role="status"
      >
        {ariaAnnouncement}
      </div>
      {/* Agent pipeline state bar — shows which agent is active */}
      <div className="voice-agent-agent-bar" role="status" aria-label="智能体状态">
        {(['idle', 'listening', 'routing', 'executing', 'ai-thinking'] as const).map((state) => (
          <span
            key={state}
            className={`voice-agent-agent-pill voice-agent-agent-${state}`}
            aria-current={agentState === state ? 'step' : undefined}
          >
            {state === 'idle' ? '○' : state === 'listening' ? '◉' : state === 'routing' ? '◐' : state === 'executing' ? '▶' : '◔'}{' '}
            {state === 'idle' ? '就绪' : state === 'listening' ? 'STT' : state === 'routing' ? '路由' : state === 'executing' ? '执行' : '思考'}
          </span>
        ))}
      </div>
      {/* Mic toggle button */}
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

      {/* Mode selector (only visible when listening) */}
      {listening && (
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
      )}

      {/* Push-to-talk recording indicator */}
      {isRecording && (
        <div className="voice-agent-recording-indicator" aria-live="polite">
          <span className="voice-agent-recording-dot" aria-hidden="true" />
          <span className="voice-agent-recording-time">
            {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
          </span>
        </div>
      )}

      <div className="voice-agent-lang-row">
        {listening && engine === 'web-speech' && (
          <>
            <span className={`voice-agent-vad-dot ${speechActive ? 'voice-agent-vad-dot-active' : ''}`} title={speechActive ? '检测到说话' : '静默'} />
            {/* Energy bar — fills proportional to RMS energy level */}
            <div
              className="voice-agent-energy-bar"
              title={`音量 ${Math.round(energyLevel * 500)}%`}
              aria-label={`音量 ${Math.round(energyLevel * 500)}%`}
            >
              <div
                className="voice-agent-energy-fill"
                style={{ width: `${Math.min(100, energyLevel * 20 * 100)}%` }}
              />
            </div>
          </>
        )}
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
        {langOverride === '__auto__' && detectedLang && (
          <span className="voice-agent-detected-lang" title={`检测到语言: ${detectedLang}`}>
            {detectedLang}
          </span>
        )}
        {listening && (
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
        )}
      </div>

      {/* Commercial STT config panel */}
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
          {/* Availability test row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className="icon-btn"
              style={{ height: 26, fontSize: 11, flexShrink: 0 }}
              disabled={providerAvailability === 'testing'}
              onClick={handleTestProvider}
              title="测试连接"
            >
              {providerAvailability === 'testing' ? '测试中…' : '测试连接'}
            </button>
            {providerAvailability === 'available' && (
              <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Check size={12} /> 可用
              </span>
            )}
            {providerAvailability === 'unavailable' && (
              <span style={{ fontSize: 11, color: '#ef4444' }} title={providerError ?? undefined}>
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
                  onChange={(e) => { const v = e.currentTarget.value; setLocalAppId(v); notifyConfigChange(localApiKey, localBaseUrl, localModel, v, localAccessToken); }}
                  placeholder="App ID（火山引擎控制台）"
                  aria-label="App ID"
                />
                <input
                  className="voice-agent-commercial-input"
                  type="password"
                  value={localAccessToken}
                  onChange={(e) => { const v = e.currentTarget.value; setLocalAccessToken(v); notifyConfigChange(localApiKey, localBaseUrl, localModel, localAppId, v); }}
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
                  onChange={(e) => { const v = e.currentTarget.value; setLocalApiKey(v); notifyConfigChange(v, localBaseUrl, localModel, localAppId, localAccessToken); }}
                  placeholder={commercialProviderKind === 'minimax' ? 'eyJ...' : 'sk-...'}
                  aria-label="API Key"
                />
                <input
                  className="voice-agent-commercial-input"
                  type="text"
                  value={localBaseUrl}
                  onChange={(e) => { const v = e.currentTarget.value; setLocalBaseUrl(v); notifyConfigChange(localApiKey, v, localModel, localAppId, localAccessToken); }}
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

      {/* Transcript display */}
      {listening && displayText && (
        <div className="voice-agent-transcript" style={confidenceStyle}>
          <span className={interimText ? 'voice-agent-interim' : 'voice-agent-final'}>
            {displayText}
          </span>
          {confidence > 0 && (
            <span className="voice-agent-confidence" style={{ color: confidenceColor }}>
              {Math.round(confidence * 100)}%
            </span>
          )}
        </div>
      )}

      {/* Pending confirmation */}
      {pendingConfirm && (
        <div className="voice-agent-confirm">
          <span className="voice-agent-confirm-label">
            确认执行「{pendingConfirm.label.replace(/^\[模糊\]\s*/, '')}」？
            {pendingConfirm.label.startsWith('[模糊]') && (
              <span className="voice-agent-confirm-fuzzy">（模糊匹配）</span>
            )}
          </span>
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
      )}

      {/* Error display */}
      {error && (
        <div className="voice-agent-error" role="alert">
          {error}
        </div>
      )}

      {/* Safe mode toggle */}
      {listening && (
        <label className="voice-agent-safe-toggle" title="安全模式：破坏性操作需确认">
          <input
            type="checkbox"
            checked={safeMode}
            onChange={(e) => onSetSafeMode(e.target.checked)}
          />
          <span className="voice-agent-safe-label">安全</span>
        </label>
      )}

      {/* Wake-word detection toggle */}
      <label className="voice-agent-wakeword-toggle" title="唤醒词检测：说任意词语自动启动语音助手">
        <input
          type="checkbox"
          checked={wakeWordEnabled}
          onChange={(e) => onSetWakeWordEnabled(e.target.checked)}
        />
        <span className="voice-agent-wakeword-label">唤醒</span>
      </label>
      {wakeWordEnabled && !listening && (
        <div className="voice-agent-wakeword-energy" title={`唤醒能量 ${Math.round(wakeWordEnergyLevel * 500)}%`}>
          <div
            className="voice-agent-wakeword-energy-fill"
            style={{ width: `${Math.min(100, wakeWordEnergyLevel * 20 * 100)}%` }}
          />
        </div>
      )}

      {/* Session history panel */}
      {listening && session.entries.length > 0 && (
        <div className="voice-agent-session-history">
          <button
            type="button"
            className="voice-agent-history-toggle"
            onClick={() => setShowSessionHistory((v) => !v)}
            aria-expanded={showSessionHistory}
            title="语音命令历史"
          >
            <History size={13} />
            <span>历史 {session.entries.length}</span>
          </button>
          {showSessionHistory && (
            <ul className="voice-agent-history-list" aria-label="语音命令历史">
              {session.entries.slice(-8).reverse().map((entry, i) => (
                <li key={i} className="voice-agent-history-entry">
                  <span className={`voice-agent-history-type voice-agent-history-type-${entry.intent.type}`}>
                    {entry.intent.type === 'action' && entry.intent.actionId ? getActionLabel(entry.intent.actionId) : entry.intent.type}
                  </span>
                  <span className="voice-agent-history-text" title={entry.sttText}>
                    {entry.sttText.length > 20 ? `${entry.sttText.slice(0, 20)}…` : entry.sttText}
                  </span>
                  {entry.confidence > 0 && (
                    <span className="voice-agent-history-conf">
                      {Math.round(entry.confidence * 100)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});
