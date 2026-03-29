import { Check, MessageSquare, Mic, MicOff, X } from 'lucide-react';
import { detectLocale } from '../../i18n';
import { useAiAssistantHubContext } from '../../contexts/AiAssistantHubContext';
import { getConfidenceColor } from '../../hooks/useVoiceAgent';
import { AiChatCard } from './AiChatCard';

const MODE_LABELS: Record<'command' | 'dictation' | 'analysis', string> = {
  command: '指令',
  dictation: '听写',
  analysis: '分析',
};

const MODE_ORDER: Array<'command' | 'dictation' | 'analysis'> = ['command', 'dictation', 'analysis'];

export function AiAssistantHubCard() {
  const locale = detectLocale();
  const {
    aiChatEnabled,
    aiIsStreaming,
    onSendAiMessage,
    voiceEnabled,
    voiceListening,
    voiceMode,
    voiceInterimText,
    voiceFinalText,
    voiceConfidence,
    voiceError,
    voiceSafeMode,
    voicePendingConfirm,
    onVoiceToggle,
    onVoiceSwitchMode,
    onVoiceConfirm,
    onVoiceCancel,
    onVoiceSetSafeMode,
  } = useAiAssistantHubContext();

  const transcript = (voiceInterimText?.trim() || voiceFinalText?.trim() || '');
  const confidence = voiceConfidence ?? 0;
  const confidenceColor = confidence > 0 ? getConfidenceColor(confidence) : undefined;
  const isZh = locale === 'zh-CN';

  return (
    <section className="transcription-ai-card transcription-ai-assistant-hub">
      <div className="transcription-ai-assistant-head">
        <div className="transcription-ai-card-head" style={{ marginBottom: 0 }}>
          <span>{isZh ? 'AI 助手中枢' : 'AI Assistant Hub'}</span>
          <span className={`transcription-ai-tag ${voiceListening ? 'transcription-ai-assistant-tag-active' : ''}`}>
            {voiceListening ? (isZh ? '语音在线' : 'Voice Live') : (isZh ? '语音离线' : 'Voice Idle')}
          </span>
        </div>
      </div>

      <div className="transcription-ai-assistant-voice">
        {!voiceEnabled ? (
          <p className="small-text" style={{ margin: 0 }}>
            {isZh ? '语音智能体未启用，请在功能开关中开启。' : 'Voice agent is disabled by feature flags.'}
          </p>
        ) : (
          <>
            <div className="transcription-ai-assistant-toolbar">
              <button
                type="button"
                className={`transcription-ai-assistant-mic ${voiceListening ? 'is-active' : ''}`}
                onClick={() => onVoiceToggle?.()}
                aria-label={voiceListening ? (isZh ? '关闭语音' : 'Stop voice') : (isZh ? '开启语音' : 'Start voice')}
              >
                {voiceListening ? <Mic size={15} /> : <MicOff size={15} />}
                <span>{voiceListening ? (isZh ? '语音进行中' : 'Listening') : (isZh ? '启动语音' : 'Start Voice')}</span>
              </button>

              {voiceListening && voiceMode && (
                <div className="transcription-ai-assistant-mode" role="radiogroup" aria-label={isZh ? '语音模式' : 'Voice mode'}>
                  {MODE_ORDER.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={voiceMode === mode}
                      className={`transcription-ai-assistant-mode-btn ${voiceMode === mode ? 'is-active' : ''}`}
                      onClick={() => onVoiceSwitchMode?.(mode)}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              )}

              <label className="transcription-ai-assistant-safe">
                <input
                  type="checkbox"
                  checked={Boolean(voiceSafeMode)}
                  onChange={(e) => onVoiceSetSafeMode?.(e.currentTarget.checked)}
                />
                <span>{isZh ? '安全模式' : 'Safe Mode'}</span>
              </label>
            </div>

            {transcript && (
              <div
                className="transcription-ai-assistant-transcript"
                style={confidenceColor ? { borderColor: confidenceColor } : undefined}
              >
                <p>{transcript}</p>
                {confidence > 0 && (
                  <span style={confidenceColor ? { color: confidenceColor } : undefined}>
                    {Math.round(confidence * 100)}%
                  </span>
                )}
              </div>
            )}

            <div className="transcription-ai-assistant-actions">
              <button
                type="button"
                className="icon-btn"
                disabled={!aiChatEnabled || !onSendAiMessage || !transcript || Boolean(aiIsStreaming)}
                onClick={() => {
                  if (!onSendAiMessage || !transcript) return;
                  void onSendAiMessage(`[语音] ${transcript}`);
                }}
              >
                <MessageSquare size={13} />
                {isZh ? '发送到聊天' : 'Send to Chat'}
              </button>
            </div>

            {voicePendingConfirm && (
              <div className="transcription-ai-assistant-confirm" role="status" aria-live="polite">
                <span>{isZh ? '待确认：' : 'Pending:'} {voicePendingConfirm.label}</span>
                {voicePendingConfirm.fromFuzzy && (
                  <span>{isZh ? '模糊匹配' : 'Fuzzy Match'}</span>
                )}
                <button type="button" className="icon-btn" onClick={() => onVoiceConfirm?.()} aria-label={isZh ? '确认' : 'Confirm'}>
                  <Check size={13} />
                </button>
                <button type="button" className="icon-btn" onClick={() => onVoiceCancel?.()} aria-label={isZh ? '取消' : 'Cancel'}>
                  <X size={13} />
                </button>
              </div>
            )}

            {voiceError && <div className="transcription-ai-assistant-error">{voiceError}</div>}
          </>
        )}
      </div>

      <div className="transcription-ai-assistant-chat">
        <AiChatCard embedded />
      </div>
    </section>
  );
}