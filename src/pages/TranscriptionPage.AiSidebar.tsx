import { lazy, Suspense } from 'react';
import '../styles/ai-hub.css';
import type {
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageAssistantRuntimeProps,
} from './TranscriptionPage.runtimeContracts';
import type { TranscriptionAssistantStatusSummary } from './transcriptionAssistantStatusSummary';

const AssistantRuntime = lazy(async () => import('./TranscriptionPage.AssistantRuntime').then((module) => ({
  default: module.TranscriptionPageAssistantRuntime,
})));

const AnalysisRuntime = lazy(async () => import('./TranscriptionPage.AnalysisRuntime').then((module) => ({
  default: module.TranscriptionPageAnalysisRuntime,
})));

type HubSidebarTab = 'assistant' | 'analysis';

export interface TranscriptionPageAiSidebarProps {
  locale: string;
  isAiPanelCollapsed: boolean;
  hubSidebarTab: HubSidebarTab;
  onHubSidebarTabChange: (tab: HubSidebarTab) => void;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
  analysisRuntimeProps: TranscriptionPageAnalysisRuntimeProps;
  assistantAttentionCount?: number;
  assistantStatusSummary: TranscriptionAssistantStatusSummary;
}

export function TranscriptionPageAiSidebar({
  locale,
  isAiPanelCollapsed,
  hubSidebarTab,
  onHubSidebarTabChange,
  assistantRuntimeProps,
  analysisRuntimeProps,
  assistantAttentionCount = 0,
  assistantStatusSummary,
}: TranscriptionPageAiSidebarProps) {
  return (
    <aside className={`transcription-ai-panel ${isAiPanelCollapsed ? 'transcription-ai-panel-collapsed' : ''}`}>
      <div className="transcription-hub-sidebar-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={hubSidebarTab === 'assistant'}
          className={`transcription-hub-sidebar-tab ${hubSidebarTab === 'assistant' ? 'is-active' : ''}`}
          onClick={() => onHubSidebarTabChange('assistant')}
        >
          {locale === 'zh-CN' ? '助手' : 'Assistant'}
          {assistantAttentionCount > 0 && <span className="transcription-ai-tab-badge">{assistantAttentionCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={hubSidebarTab === 'analysis'}
          className={`transcription-hub-sidebar-tab ${hubSidebarTab === 'analysis' ? 'is-active' : ''}`}
          onClick={() => onHubSidebarTabChange('analysis')}
        >
          {locale === 'zh-CN' ? 'AI 分析' : 'AI Analysis'}
        </button>
      </div>

      <div className={`transcription-ai-status-strip is-${assistantStatusSummary.tone}`}>
        <div className="transcription-ai-status-copy">
          <strong>{assistantStatusSummary.headline}</strong>
          <span>{assistantStatusSummary.detail}</span>
        </div>
        {assistantStatusSummary.chips.length > 0 && (
          <div className="transcription-ai-status-chips">
            {assistantStatusSummary.chips.map((chip) => (
              <span key={chip} className="transcription-ai-status-chip">{chip}</span>
            ))}
          </div>
        )}
      </div>

      {hubSidebarTab === 'assistant' ? (
        <Suspense fallback={null}>
          <AssistantRuntime {...assistantRuntimeProps} />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <AnalysisRuntime {...analysisRuntimeProps} />
        </Suspense>
      )}
    </aside>
  );
}
