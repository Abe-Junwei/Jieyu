/**
 * ObserverStatus | AI观察者状态组件
 *
 * 展示 AI 观察者当前阶段(collecting/transcribing/glossing/reviewing)和可执行的建议(recommendations)
 * Displays AI observer current stage and actionable recommendations (max 2 visible + overflow indicator)
 */

import { type FC, useCallback } from 'react';
import { detectLocale, t } from '../../../i18n';

export interface AiObserverRecommendation {
  id: string;
  title: string;
  actionLabel?: string;
  detail?: string;
}

export interface ObserverStatusProps {
  // 状态 | State
  observerStage: string | undefined;
  recommendations: AiObserverRecommendation[];

  // 回调 | Callbacks
  onExecuteRecommendation: (item: AiObserverRecommendation) => void;
}

const ObserverStatus: FC<ObserverStatusProps> = ({
  observerStage,
  recommendations,
  onExecuteRecommendation,
}) => {
  const locale = detectLocale();

  const getStageLabel = useCallback((stage: string | undefined): string => {
    if (!stage) return t(locale, 'ai.stages.collecting');
    switch (stage) {
      case 'collecting': return t(locale, 'ai.stages.collecting');
      case 'transcribing': return t(locale, 'ai.stages.transcribing');
      case 'glossing': return t(locale, 'ai.stages.glossing');
      case 'reviewing': return t(locale, 'ai.stages.reviewing');
      default: return t(locale, 'ai.stages.collecting');
    }
  }, [locale]);

  const handleRecommendationClick = useCallback((item: AiObserverRecommendation) => {
    onExecuteRecommendation(item);
  }, [onExecuteRecommendation]);

  const MAX_VISIBLE = 2;
  const visibleRecs = recommendations.slice(0, MAX_VISIBLE);
  const overflowCount = Math.max(0, recommendations.length - MAX_VISIBLE);

  return (
    <>
      <span className="transcription-ai-observer-stage-label">
        {t(locale, 'ai.observer.currentStage')}
        {getStageLabel(observerStage)}
      </span>
      {recommendations.length > 0 && (
        <div className="transcription-ai-observer-recs-inline">
          {visibleRecs.map((item) => (
            <button
              key={item.id}
              type="button"
              className="transcription-ai-observer-rec-btn"
              onClick={() => handleRecommendationClick(item)}
              title={item.detail}
            >
              {item.actionLabel ?? item.title}
            </button>
          ))}
          {overflowCount > 0 && (
            <span
              className="transcription-ai-observer-rec-overflow"
              title={recommendations.slice(MAX_VISIBLE).map((i) => i.actionLabel ?? i.title).join('、')}
            >
              +{overflowCount}
            </span>
          )}
        </div>
      )}
    </>
  );
};

export default ObserverStatus;
