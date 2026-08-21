import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { normalizeLocale, t } from '../i18n';
import type {
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageAssistantRuntimeProps,
} from './TranscriptionPage.runtimeContracts';

const AnalysisRuntime = lazy(async () =>
  import('./TranscriptionPage.AnalysisRuntime').then((module) => ({
    default: module.TranscriptionPageAnalysisRuntime,
  })),
);

export interface TranscriptionPageAiSidebarProps {
  locale: string;
  isAiPanelCollapsed: boolean;
  shouldRenderRuntime?: boolean;
  hubSidebarTab: 'assistant' | 'analysis';
  onHubSidebarTabChange: (tab: 'assistant' | 'analysis') => void;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
  analysisRuntimeProps: TranscriptionPageAnalysisRuntimeProps;
  assistantAttentionCount?: number;
}

export function TranscriptionPageAiSidebar({
  locale,
  isAiPanelCollapsed,
  shouldRenderRuntime = true,
  analysisRuntimeProps,
}: TranscriptionPageAiSidebarProps) {
  const uiLocale = normalizeLocale(locale) ?? 'zh-CN';

  return (
    <section
      className={`transcription-ai-panel ${isAiPanelCollapsed ? 'transcription-ai-panel-collapsed' : ''}`}
      aria-label={t(uiLocale, 'transcription.aiSidebar.panelRegion')}
    >
      {shouldRenderRuntime ? (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <AnalysisRuntime {...analysisRuntimeProps} />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </section>
  );
}
