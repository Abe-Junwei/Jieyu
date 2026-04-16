import { lazy, Suspense } from 'react';
import { normalizeLocale, t } from '../i18n';
import type { TranscriptionPageAnalysisRuntimeProps, TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';

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
  shouldRenderRuntime?: boolean;
  hubSidebarTab: HubSidebarTab;
  onHubSidebarTabChange: (tab: HubSidebarTab) => void;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
  analysisRuntimeProps: TranscriptionPageAnalysisRuntimeProps;
  assistantAttentionCount?: number;
}

export function TranscriptionPageAiSidebar({
  locale,
  isAiPanelCollapsed,
  shouldRenderRuntime = true,
  hubSidebarTab,
  onHubSidebarTabChange,
  assistantRuntimeProps,
  analysisRuntimeProps,
  assistantAttentionCount = 0,
}: TranscriptionPageAiSidebarProps) {
  const uiLocale = normalizeLocale(locale) ?? 'zh-CN';

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
          {t(uiLocale, 'transcription.aiSidebar.assistantTab')}
          {assistantAttentionCount > 0 && <span className="transcription-ai-tab-badge">{assistantAttentionCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={hubSidebarTab === 'analysis'}
          className={`transcription-hub-sidebar-tab ${hubSidebarTab === 'analysis' ? 'is-active' : ''}`}
          onClick={() => onHubSidebarTabChange('analysis')}
        >
          {t(uiLocale, 'transcription.aiSidebar.analysisTab')}
        </button>
      </div>

      {shouldRenderRuntime ? (
        hubSidebarTab === 'assistant' ? (
          <Suspense fallback={null}>
            <AssistantRuntime {...assistantRuntimeProps} />
          </Suspense>
        ) : (
          <Suspense fallback={null}>
            <AnalysisRuntime {...analysisRuntimeProps} />
          </Suspense>
        )
      ) : null}
    </aside>
  );
}
