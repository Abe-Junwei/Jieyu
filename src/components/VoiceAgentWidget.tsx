/**
 * VoiceAgentWidget — 语音智能体 UI 组件
 *
 * 包含麦克风按钮、模式选择器、即时转写显示和确认对话框。
 *
 * @see 解语-语音智能体架构设计方案 §4.6
 */

import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Mic, MicOff, Check, X } from 'lucide-react';
import { getConfidenceColor, type VoiceAgentMode } from '../hooks/useVoiceAgent';
import { toBcp47 } from '../utils/langMapping';
import type { SttEngine } from '../services/VoiceInputService';

// ── Types ──

export interface VoiceAgentWidgetProps {
  listening: boolean;
  speechActive: boolean;
  mode: VoiceAgentMode;
  interimText: string;
  finalText: string;
  confidence: number;
  error: string | null;
  pendingConfirm: { actionId: string; label: string } | null;
  safeMode: boolean;
  corpusLang: string;
  langOverride: string | null;
  engine: SttEngine;
  isRecording: boolean;
  onToggle: (mode?: VoiceAgentMode) => void;
  onMicPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp?: () => void;
  onSwitchMode: (mode: VoiceAgentMode) => void;
  onSwitchEngine: (engine: SttEngine) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSetSafeMode: (on: boolean) => void;
  onSetLangOverride: (lang: string | null) => void;
}

// ── Mode labels ──

const MODE_LABELS: Record<VoiceAgentMode, string> = {
  command: '指令',
  dictation: '听写',
  analysis: '分析',
};

const MODE_ORDER: VoiceAgentMode[] = ['command', 'dictation', 'analysis'];

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
    pendingConfirm,
    safeMode,
    corpusLang,
    langOverride,
    engine,
    isRecording,
    onToggle,
    onMicPointerDown,
    onMicPointerUp,
    onSwitchMode,
    onSwitchEngine,
    onConfirm,
    onCancel,
    onSetSafeMode,
    onSetLangOverride,
  } = props;

  const displayText = interimText || finalText;
  const confidenceColor = confidence > 0 ? getConfidenceColor(confidence) : undefined;

  const confidenceStyle: CSSProperties | undefined = confidenceColor
    ? { borderColor: confidenceColor }
    : undefined;

  return (
    <div className="voice-agent-widget">
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

      <div className="voice-agent-lang-row">
        {listening && (
          <span className={`voice-agent-vad-dot ${speechActive ? 'voice-agent-vad-dot-active' : ''}`} title={speechActive ? '检测到说话' : '静默'} />
        )}
        <span className="voice-agent-lang-badge" title={`BCP-47: ${toBcp47(corpusLang)}`}>
          {`语种 ${corpusLang} · ${toBcp47(corpusLang)}`}
        </span>
        <label className="voice-agent-lang-manual-toggle" title="手动覆盖识别语言">
          <input
            type="checkbox"
            checked={langOverride !== null}
            onChange={(e) => onSetLangOverride(e.currentTarget.checked ? corpusLang : null)}
          />
          <span>手动</span>
        </label>
        {langOverride !== null && (
          <input
            className="voice-agent-lang-input"
            value={langOverride}
            onChange={(e) => onSetLangOverride(e.currentTarget.value)}
            placeholder="ISO639-3，例如 cmn"
            aria-label="手动识别语言代码"
          />
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
            <option value="gemini-multimodal">Gemini 多模态</option>
          </select>
        )}
      </div>

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
            确认执行「{pendingConfirm.label}」？
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
    </div>
  );
});
