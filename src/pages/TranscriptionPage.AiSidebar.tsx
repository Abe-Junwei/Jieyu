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
    <section
      className={`transcription-ai-panel ${isAiPanelCollapsed ? 'transcription-ai-panel-collapsed' : ''}`}
      aria-label={t(uiLocale, 'transcription.aiSidebar.panelRegion')}
    >
      <div className="transcription-hub-sidebar-tabs panel-edge-nav panel-edge-nav--inline" role="tablist">
        <div className={`panel-edge-nav-row ${hubSidebarTab === 'assistant' ? 'panel-edge-nav-row-active' : ''}`.trim()}>
          <button
            type="button"
            role="tab"
            aria-selected={hubSidebarTab === 'assistant'}
            className={`transcription-hub-sidebar-tab panel-edge-nav-btn ${hubSidebarTab === 'assistant' ? 'is-active' : ''}`}
            onClick={() => onHubSidebarTabChange('assistant')}
          >
            <span className="panel-edge-nav-label">
              <strong className="panel-edge-nav-title">{t(uiLocale, 'transcription.aiSidebar.assistantTab')}</strong>
            </span>
            {assistantAttentionCount > 0 && <span className="transcription-ai-tab-badge">{assistantAttentionCount}</span>}
          </button>
        </div>
        <div className={`panel-edge-nav-row ${hubSidebarTab === 'analysis' ? 'panel-edge-nav-row-active' : ''}`.trim()}>
          <button
            type="button"
            role="tab"
            aria-selected={hubSidebarTab === 'analysis'}
            className={`transcription-hub-sidebar-tab panel-edge-nav-btn ${hubSidebarTab === 'analysis' ? 'is-active' : ''}`}
            onClick={() => onHubSidebarTabChange('analysis')}
          >
            <span className="panel-edge-nav-label">
              <strong className="panel-edge-nav-title">{t(uiLocale, 'transcription.aiSidebar.analysisTab')}</strong>
            </span>
          </button>
        </div>
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
    </section>
  );
}
