import { memo } from 'react';
import { Bot, WandSparkles } from 'lucide-react';
import { t, tf, useLocale } from '../i18n';
import { useAiPanelContext } from '../contexts/AiPanelContext';
import { AiEmbeddingCard } from './ai/AiEmbeddingCard';

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

  return (
    <div className="transcription-analysis-content">
      {/* 模式切换条 | Mode switch bar */}
      <div className="transcription-analysis-toolbar">
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

      {/* 内容区 */}
      <div className="transcription-analysis-tab-content">
        {activeTab === 'embedding' && shouldShow('embedding_ops') && <AiEmbeddingCard />}
        {activeTab === 'stats' && (
          <>
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
          </>
        )}
      </div>

      {/* 子 tab 栏（底部）：向量检索 / 统计 */}
      <div className="transcription-assistant-hub-bottom-head" style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
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
