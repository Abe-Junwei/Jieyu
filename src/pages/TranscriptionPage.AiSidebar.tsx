import { lazy, Suspense } from 'react';
import { AiChatCard } from '../components/ai/AiChatCard';
import type { VoiceAgentWidgetProps } from '../components/VoiceAgentWidget';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import { EmbeddingProvider, type EmbeddingContextValue } from '../contexts/EmbeddingContext';

const AiAnalysisPanel = lazy(async () => import('../components/AiAnalysisPanel').then((module) => ({
  default: module.AiAnalysisPanel,
})));

const VoiceAgentWidget = lazy(async () => import('../components/VoiceAgentWidget').then((module) => ({
  default: module.VoiceAgentWidget,
})));

type HubSidebarTab = 'assistant' | 'analysis';

type AiChatVoiceEntry = {
  enabled: boolean;
  expanded: boolean;
  listening: boolean;
  statusText: string;
  onTogglePanel: () => void;
};

interface TranscriptionPageAiSidebarProps {
  locale: string;
  isAiPanelCollapsed: boolean;
  hubSidebarTab: HubSidebarTab;
  onHubSidebarTabChange: (tab: HubSidebarTab) => void;
  featureVoiceAgentEnabled: boolean;
  assistantVoiceExpanded: boolean;
  onAssistantVoicePanelToggle: () => void;
  voiceWidgetProps: VoiceAgentWidgetProps;
  analysisTab: AnalysisBottomTab;
  onAnalysisTabChange: (tab: AnalysisBottomTab) => void;
  embeddingContextValue: EmbeddingContextValue;
}

export function TranscriptionPageAiSidebar({
  locale,
  isAiPanelCollapsed,
  hubSidebarTab,
  onHubSidebarTabChange,
  featureVoiceAgentEnabled,
  assistantVoiceExpanded,
  onAssistantVoicePanelToggle,
  voiceWidgetProps,
  analysisTab,
  onAnalysisTabChange,
  embeddingContextValue,
}: TranscriptionPageAiSidebarProps) {
  const voiceEntry: AiChatVoiceEntry | undefined = featureVoiceAgentEnabled
    ? ({
      enabled: true,
      expanded: assistantVoiceExpanded,
      listening: voiceWidgetProps.listening,
      statusText: voiceWidgetProps.listening
        ? (locale === 'zh-CN' ? '监听中' : 'Listening')
        : (locale === 'zh-CN' ? '待命' : 'Standby'),
      onTogglePanel: onAssistantVoicePanelToggle,
    } satisfies AiChatVoiceEntry)
    : undefined;

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

      {hubSidebarTab === 'assistant' ? (
        <div className="transcription-hub-assistant-panel">
          <div className="transcription-hub-assistant-chat-section">
            <AiChatCard
              embedded
              voiceDrawer={featureVoiceAgentEnabled && assistantVoiceExpanded
                ? (
                    <Suspense fallback={null}>
                      <VoiceAgentWidget {...voiceWidgetProps} />
                    </Suspense>
                  )
                : undefined}
              voiceEntry={voiceEntry}
            />
          </div>
        </div>
      ) : (
        <div className="transcription-hub-sidebar-panel-body">
          <EmbeddingProvider value={embeddingContextValue}>
            <Suspense fallback={null}>
              <AiAnalysisPanel isCollapsed={false} activeTab={analysisTab} onChangeActiveTab={onAnalysisTabChange} />
            </Suspense>
          </EmbeddingProvider>
        </div>
      )}
    </aside>
  );
}
