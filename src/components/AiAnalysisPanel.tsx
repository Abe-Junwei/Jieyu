import { memo } from 'react';
import { Bot, WandSparkles } from 'lucide-react';
import { t, tf, useLocale } from '../i18n';
import { useAiPanelContext } from '../contexts/AiPanelContext';
import { AiEmbeddingCard } from './ai/AiEmbeddingCard';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';

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

/** 底部面板 tab 类型 | Bottom panel tab keys */
export type AnalysisBottomTab = 'embedding' | 'stats';

interface AiAnalysisPanelProps {
  isCollapsed: boolean;
  /** 当前激活的模式 tab（控制任务聚焦/全量视图的内容区） */
  activeTab?: AnalysisBottomTab;
  /** 切换模式 tab 回调 */
  onChangeActiveTab?: (tab: AnalysisBottomTab) => void;
}

export const AiAnalysisPanel = memo(function AiAnalysisPanel({
  isCollapsed,
  activeTab = 'embedding',
  onChangeActiveTab,
}: AiAnalysisPanelProps) {
  const locale = useLocale();
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

  if (isCollapsed) return null;

  const activeTabLabel = activeTab === 'embedding'
    ? t(locale, 'ai.header.embeddingTab')
    : t(locale, 'ai.header.statsTab');
  const currentTaskLabel = aiCurrentTask ? taskLabel[aiCurrentTask] : t(locale, 'ai.header.taskUnknown');

  return (
    <div className="transcription-analysis-panel panel-design-match-content">
      <div className="transcription-analysis-panel-header">
        <div className="transcription-ai-header-title">
          <Bot size={14} />
          <span className="transcription-analysis-toolbar-title">{t(locale, 'ai.header.title')}</span>
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

      <div className="transcription-analysis-panel-body">
        <PanelSummary
          className="transcription-analysis-panel-summary"
          title={activeTabLabel}
          description={`${t(locale, 'ai.header.currentTask')}${currentTaskLabel}`}
          meta={(
            <div className="panel-meta">
              <span className="panel-chip">{tf(locale, 'ai.stats.database', { dbName })}</span>
              <span className="panel-chip">{tf(locale, 'ai.stats.utterance', { utteranceCount })}</span>
              <span className="panel-chip">{tf(locale, 'ai.stats.translationLayer', { translationLayerCount })}</span>
            </div>
          )}
          supportingText={activeTab === 'embedding' ? t(locale, 'ai.header.focusModeDesc') : t(locale, 'ai.header.allModeDesc')}
        />

        <div className="transcription-analysis-tab-content">
          {activeTab === 'embedding' && shouldShow('embedding_ops') && <AiEmbeddingCard />}
          {activeTab === 'stats' && (
            <PanelSection
              className="transcription-analysis-stats-section"
              title={t(locale, 'ai.header.statsTab')}
              description={`${t(locale, 'ai.header.currentTask')}${currentTaskLabel}`}
            >
              <div className="transcription-ai-stats-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.header.currentTask')}</span>
                  <span className="transcription-analysis-stats-value" aria-live="polite">{currentTaskLabel}</span>
                </div>
                <div className="transcription-analysis-stats-row transcription-analysis-stats-row-accent">
                  <span className="transcription-analysis-stats-label transcription-analysis-stats-label-accent">
                    <WandSparkles size={12} />
                    <span>{currentTaskLabel}</span>
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {aiConfidenceAvg === null ? t(locale, 'ai.stats.aiConfidenceNone') : tf(locale, 'ai.stats.aiConfidence', { confidence: (aiConfidenceAvg * 100).toFixed(1) })}
                  </span>
                </div>
              </div>
            </PanelSection>
          )}
        </div>
      </div>

      <div className="transcription-analysis-panel-footer">
        {(['embedding', 'stats'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`transcription-assistant-hub-tab ${activeTab === tab ? 'transcription-assistant-hub-tab-active' : ''}`}
            onClick={() => onChangeActiveTab?.(tab)}
          >
            {tab === 'embedding' ? t(locale, 'ai.header.embeddingTab') : t(locale, 'ai.header.statsTab')}
          </button>
        ))}
      </div>
    </div>
  );
});
