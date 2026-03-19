import { detectLocale, t } from '../../i18n';
import { useAiPanelContext } from '../../contexts/AiPanelContext';

export function AiObserverCard() {
  const locale = detectLocale();
  const {
    observerStage,
    observerRecommendations,
    onExecuteRecommendation,
  } = useAiPanelContext();

  const stageLabel: Partial<Record<'collecting' | 'transcribing' | 'glossing' | 'reviewing', string>> = {
    collecting: t(locale, 'ai.stages.collecting'),
    transcribing: t(locale, 'ai.stages.transcribing'),
    glossing: t(locale, 'ai.stages.glossing'),
    reviewing: t(locale, 'ai.stages.reviewing'),
  };

  return (
    <div className="transcription-ai-card">
      <div className="transcription-ai-card-head">
        <span>{t(locale, 'ai.observer.title')}</span>
        <span className="transcription-ai-tag">{t(locale, 'ai.observer.realtime')}</span>
      </div>
      <p className="small-text">{t(locale, 'ai.observer.currentStage')}{(observerStage && stageLabel[observerStage]) ?? t(locale, 'ai.stages.collecting')}</p>
      {(!observerRecommendations || observerRecommendations.length === 0) ? (
        <p className="small-text">{t(locale, 'ai.observer.noRecommendations')}</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {observerRecommendations.map((item) => (
            <div key={item.id} style={{ background: '#f8fafc', borderRadius: 8, padding: '6px 8px' }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{item.detail}</div>
              {item.actionLabel && (
                <div style={{ marginTop: 6 }}>
                  <button type="button" className="icon-btn" style={{ height: 26, minWidth: 72, fontSize: 12 }} onClick={() => onExecuteRecommendation?.(item)}>{item.actionLabel}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
