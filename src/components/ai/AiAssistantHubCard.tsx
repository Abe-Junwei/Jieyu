import { Check, MessageSquare, Mic, MicOff, X } from 'lucide-react';
import { JIEYU_LUCIDE_INLINE_TIGHT, JIEYU_LUCIDE_WAVE_MD } from '../../utils/jieyuLucideIcon';
import { t, useLocale } from '../../i18n';
import { useAiAssistantHubContext } from '../../contexts/AiAssistantHubContext';
import { getConfidenceColor } from '../../hooks/voiceAgentPresentation';
import { AiChatCard } from './AiChatCard';

const MODE_LABEL_KEYS: Record<'command' | 'dictation' | 'analysis', 'ai.assistantHub.mode.command' | 'ai.assistantHub.mode.dictation' | 'ai.assistantHub.mode.analysis'> = {
  command: 'ai.assistantHub.mode.command',
  dictation: 'ai.assistantHub.mode.dictation',
  analysis: 'ai.assistantHub.mode.analysis',
};

const MODE_ORDER: Array<'command' | 'dictation' | 'analysis'> = ['command', 'dictation', 'analysis'];

export function AiAssistantHubCard() {
  const locale = useLocale();
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

  return (
    <section className="transcription-ai-card transcription-ai-assistant-hub">
      <div className="transcription-ai-assistant-head">
        <div className="transcription-ai-card-head transcription-ai-card-head-compact">
          <span>{t(locale, 'ai.assistantHub.title')}</span>
          <span className={`transcription-ai-tag ${voiceListening ? 'transcription-ai-assistant-tag-active' : ''}`}>
            {voiceListening ? t(locale, 'ai.assistantHub.voiceLive') : t(locale, 'ai.assistantHub.voiceIdle')}
          </span>
        </div>
      </div>

      <div className="transcription-ai-assistant-voice">
        {!voiceEnabled ? (
          <p className="small-text transcription-ai-assistant-muted-text">
            {t(locale, 'ai.assistantHub.disabled')}
          </p>
        ) : (
          <>
            <div className="transcription-ai-assistant-toolbar">
              <button
                type="button"
                className={`transcription-ai-assistant-mic ${voiceListening ? 'is-active' : ''}`}
                onClick={() => onVoiceToggle?.()}
                aria-label={voiceListening ? t(locale, 'ai.assistantHub.stopVoice') : t(locale, 'ai.assistantHub.startVoice')}
              >
                {voiceListening ? <Mic className={JIEYU_LUCIDE_WAVE_MD} /> : <MicOff className={JIEYU_LUCIDE_WAVE_MD} />}
                <span>{voiceListening ? t(locale, 'ai.assistantHub.listening') : t(locale, 'ai.assistantHub.startVoiceButton')}</span>
              </button>

              {voiceListening && voiceMode && (
                <div className="transcription-ai-assistant-mode" role="radiogroup" aria-label={t(locale, 'ai.assistantHub.voiceMode')}>
                  {MODE_ORDER.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={voiceMode === mode}
                      className={`transcription-ai-assistant-mode-btn ${voiceMode === mode ? 'is-active' : ''}`}
                      onClick={() => onVoiceSwitchMode?.(mode)}
                    >
                      {t(locale, MODE_LABEL_KEYS[mode])}
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
                <span>{t(locale, 'ai.assistantHub.safeMode')}</span>
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
                  void onSendAiMessage(`[${t(locale, 'ai.assistantHub.voiceTag')}] ${transcript}`);
                }}
              >
                <MessageSquare className={JIEYU_LUCIDE_INLINE_TIGHT} />
                {t(locale, 'ai.assistantHub.sendToChat')}
              </button>
            </div>

            {voicePendingConfirm && (
              <div className="transcription-ai-assistant-confirm" role="status" aria-live="polite">
                <span>{t(locale, 'ai.assistantHub.pending')} {voicePendingConfirm.label}</span>
                {voicePendingConfirm.fromFuzzy && (
                  <span>{t(locale, 'ai.assistantHub.fuzzyMatch')}</span>
                )}
                <button type="button" className="icon-btn" onClick={() => onVoiceConfirm?.()} aria-label={t(locale, 'ai.assistantHub.confirm')}>
                  <Check className={JIEYU_LUCIDE_INLINE_TIGHT} />
                </button>
                <button type="button" className="icon-btn" onClick={() => onVoiceCancel?.()} aria-label={t(locale, 'ai.assistantHub.cancel')}>
                  <X className={JIEYU_LUCIDE_INLINE_TIGHT} />
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