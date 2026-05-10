import { memo } from 'react';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_AI_PANEL, JIEYU_MATERIAL_AI_PANEL_SM } from '../utils/jieyuMaterialIcon';
import { t, tf, useLocale } from '../i18n';
import { useAiPanelContext } from '../contexts/AiPanelContext';
import { AiEmbeddingCard } from './ai/AiEmbeddingCard';
import { PanelChip } from './ui';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';
import type { AiPanelCardKey, AiPanelTask, AnalysisBottomTab } from './AiAnalysisPanel.types';
import { AiAnalysisPanelAcousticTabContent } from './AiAnalysisPanelAcousticTabContent';
import { useAiAnalysisPanelAcousticModel } from './useAiAnalysisPanelAcousticModel';
export type {
  AiPanelCardKey,
  AiPanelMode,
  AiPanelTask,
  AnalysisBottomTab,
} from './AiAnalysisPanel.types';

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
  const panel = useAiPanelContext();
  const {
    dbName,
    unitCount,
    translationLayerCount,
    aiConfidenceAvg,
    aiCurrentTask,
    aiPanelMode,
    aiVisibleCards,
    onChangeAiPanelMode,
    vadCacheStatus,
  } = panel;

  const acousticModel = useAiAnalysisPanelAcousticModel(panel);

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

  const currentTaskLabel = aiCurrentTask
    ? taskLabel[aiCurrentTask]
    : t(locale, 'ai.header.taskUnknown');
  const vadCacheLabel =
    vadCacheStatus?.state === 'ready'
      ? tf(locale, 'ai.stats.vadCacheHit', {
          engine: vadCacheStatus.engine ?? 'unknown',
          segmentCount: vadCacheStatus.segmentCount ?? 0,
        })
      : vadCacheStatus?.state === 'warming'
        ? tf(locale, 'ai.stats.vadCacheWarming', {
            engine: vadCacheStatus.engine ?? 'unknown',
            progress: Math.round((vadCacheStatus.progressRatio ?? 0) * 100),
            processedFrames: vadCacheStatus.processedFrames ?? 0,
            totalFrames: vadCacheStatus.totalFrames ?? 0,
          })
        : vadCacheStatus?.state === 'missing'
          ? t(locale, 'ai.stats.vadCacheMiss')
          : t(locale, 'ai.stats.vadCacheUnavailable');
  const activeTabLabel =
    activeTab === 'embedding'
      ? t(locale, 'ai.header.embeddingTab')
      : activeTab === 'acoustic'
        ? t(locale, 'ai.header.acousticTab')
        : t(locale, 'ai.header.statsTab');
  const activeTabDescription =
    activeTab === 'embedding'
      ? t(locale, 'ai.header.focusModeDesc')
      : activeTab === 'acoustic'
        ? t(locale, 'ai.header.acousticTabDesc')
        : t(locale, 'ai.header.allModeDesc');

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="pnl-analysis-panel panel-design-match-content" data-ai-analysis-panel="true">
      <div className="transcription-analysis-panel-header">
        <div className="transcription-ai-header-title">
          <MaterialSymbol name="smart_toy" aria-hidden className={JIEYU_MATERIAL_AI_PANEL} />
          <span className="transcription-analysis-toolbar-title">
            {t(locale, 'ai.header.title')}
          </span>
        </div>
        <div
          className="transcription-ai-mode-switch"
          role="group"
          aria-label={t(locale, 'ai.header.modeSwitch')}
        >
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
          meta={
            <div className="panel-meta">
              <PanelChip>{tf(locale, 'ai.stats.database', { dbName })}</PanelChip>
              <PanelChip>{tf(locale, 'ai.stats.unit', { unitCount })}</PanelChip>
              <PanelChip>
                {tf(locale, 'ai.stats.translationLayer', { translationLayerCount })}
              </PanelChip>
              {activeTab === 'acoustic' && acousticModel.acousticSummary ? (
                <>
                  {acousticModel.acousticDurationSec != null ? (
                    <PanelChip>
                      {tf(locale, 'ai.acoustic.duration', {
                        durationSec: acousticModel.acousticDurationSec.toFixed(2),
                      })}
                    </PanelChip>
                  ) : null}
                  <PanelChip>
                    {tf(locale, 'ai.acoustic.hotspotCount', {
                      count: acousticModel.acousticHotspotCount,
                    })}
                  </PanelChip>
                </>
              ) : null}
            </div>
          }
          supportingText={activeTabDescription}
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
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.header.currentTask')}
                  </span>
                  <span className="transcription-analysis-stats-value" aria-live="polite">
                    {currentTaskLabel}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row transcription-analysis-stats-row-accent">
                  <span className="transcription-analysis-stats-label transcription-analysis-stats-label-accent">
                    <MaterialSymbol
                      name="auto_fix_high"
                      aria-hidden
                      className={JIEYU_MATERIAL_AI_PANEL_SM}
                    />
                    <span>{currentTaskLabel}</span>
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {aiConfidenceAvg === null
                      ? t(locale, 'ai.stats.aiConfidenceNone')
                      : tf(locale, 'ai.stats.aiConfidence', {
                          confidence: (aiConfidenceAvg * 100).toFixed(1),
                        })}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.stats.vadCacheLabel')}
                  </span>
                  <span className="transcription-analysis-stats-value">{vadCacheLabel}</span>
                </div>
              </div>
            </PanelSection>
          )}
          {activeTab === 'acoustic' && (
            <AiAnalysisPanelAcousticTabContent
              activeTab={activeTab}
              vadCacheLabel={vadCacheLabel}
              model={acousticModel}
            />
          )}
        </div>
      </div>

      <div className="transcription-analysis-panel-footer">
        {(['embedding', 'stats', 'acoustic'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`transcription-assistant-hub-tab ${activeTab === tab ? 'transcription-assistant-hub-tab-active' : ''}`}
            onClick={() => onChangeActiveTab?.(tab)}
          >
            {tab === 'embedding'
              ? t(locale, 'ai.header.embeddingTab')
              : tab === 'acoustic'
                ? t(locale, 'ai.header.acousticTab')
                : t(locale, 'ai.header.statsTab')}
          </button>
        ))}
      </div>
    </div>
  );
});
