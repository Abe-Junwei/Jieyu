import { memo } from 'react';
import { Bot, WandSparkles } from 'lucide-react';
import { detectLocale, t, tf } from '../i18n';
import { useAiPanelContext } from '../contexts/AiPanelContext';
import { AiChatCard } from './ai/AiChatCard';
import { AiEmbeddingCard } from './ai/AiEmbeddingCard';
import { AiObserverCard } from './ai/AiObserverCard';
import { UtteranceAnalysisCards } from './ai/UtteranceAnalysisCards';

export type AiPanelMode = 'auto' | 'all';

export type AiPanelTask =
  | 'segmentation'
  | 'transcription'
  | 'translation'
  | 'pos_tagging'
  | 'glossing'
  | 'risk_review'
  | 'ai_chat_setup';

export type AiPanelCardKey =
  | 'ai_chat'
  | 'embedding_ops'
  | 'task_observer'
  | 'translation_focus'
  | 'generation_status'
  | 'context_analysis'
  | 'dictionary_matches'
  | 'token_notes'
  | 'pos_tagging'
  | 'phoneme_consistency';

interface AiAnalysisPanelProps {
  isCollapsed: boolean;
}

export const AiAnalysisPanel = memo(function AiAnalysisPanel({
  isCollapsed,
}: AiAnalysisPanelProps) {
  const locale = detectLocale();
  const {
    dbName,
    utteranceCount,
    translationLayerCount,
    aiConfidenceAvg,
    aiCurrentTask,
    aiPanelMode,
    aiVisibleCards,
    onChangeAiPanelMode,
  } = useAiPanelContext();

  const shouldShow = (card: AiPanelCardKey): boolean => {
    if (!aiVisibleCards) return true;
    return aiVisibleCards[card];
  };

  const taskLabel: Record<AiPanelTask, string> = {
    segmentation: t(locale, 'ai.task.segmentation'),
    transcription: t(locale, 'ai.task.transcription'),
    translation: t(locale, 'ai.task.translation'),
    pos_tagging: t(locale, 'ai.task.posTagging'),
    glossing: t(locale, 'ai.task.glossing'),
    risk_review: t(locale, 'ai.task.riskReview'),
    ai_chat_setup: t(locale, 'ai.task.aiChatSetup'),
  };

  return (
    <aside className={`transcription-ai-panel ${isCollapsed ? 'transcription-ai-panel-collapsed' : ''}`}>
      <div className="transcription-ai-header">
        <div className="transcription-ai-header-title">
          <Bot size={16} />
          <h3>{t(locale, 'ai.header.title')}</h3>
        </div>
        <div className="transcription-ai-mode-switch" role="group" aria-label={t(locale, 'ai.header.modeSwitch')}>
          <button
            type="button"
            className={`transcription-ai-mode-btn ${aiPanelMode === 'auto' ? 'is-active' : ''}`}
            disabled={aiPanelMode === 'auto'}
            aria-pressed={aiPanelMode === 'auto'}
            aria-label={t(locale, 'ai.header.focusModeDesc')}
            title={t(locale, 'ai.header.focusModeDesc')}
            onClick={() => onChangeAiPanelMode?.('auto')}
          >
            {t(locale, 'ai.header.focusMode')}
          </button>
          <button
            type="button"
            className={`transcription-ai-mode-btn ${aiPanelMode === 'all' ? 'is-active' : ''}`}
            disabled={aiPanelMode === 'all'}
            aria-pressed={aiPanelMode === 'all'}
            aria-label={t(locale, 'ai.header.allModeDesc')}
            title={t(locale, 'ai.header.allModeDesc')}
            onClick={() => onChangeAiPanelMode?.('all')}
          >
            {t(locale, 'ai.header.allMode')}
          </button>
        </div>
      </div>

      {shouldShow('ai_chat') && <AiChatCard />}
      {shouldShow('embedding_ops') && <AiEmbeddingCard />}
      {shouldShow('task_observer') && <AiObserverCard />}
      <UtteranceAnalysisCards shouldShow={shouldShow} />

      <div className="transcription-ai-task-hint" aria-live="polite">
        {t(locale, 'ai.header.currentTask')}{aiCurrentTask ? taskLabel[aiCurrentTask] : t(locale, 'ai.header.taskUnknown')}
      </div>

      <div className="transcription-ai-stats-panel transcription-ai-stats-panel-footer">
        <span className="toolbar-chip small-chip">{tf(locale, 'ai.stats.database', { dbName })}</span>
        <span className="toolbar-chip small-chip">{tf(locale, 'ai.stats.utterance', { utteranceCount })}</span>
        <span className="toolbar-chip small-chip">{tf(locale, 'ai.stats.translationLayer', { translationLayerCount })}</span>
        <span className="toolbar-chip small-chip">
          <WandSparkles size={12} />
          {aiConfidenceAvg === null ? t(locale, 'ai.stats.aiConfidenceNone') : tf(locale, 'ai.stats.aiConfidence', { confidence: (aiConfidenceAvg * 100).toFixed(1) })}
        </span>
      </div>
    </aside>
  );
});
