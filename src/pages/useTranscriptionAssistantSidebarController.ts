import { useMemo } from 'react';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import { useAiChatContextValue, type AiChatContextSource } from '../hooks/useAiChatContextValue';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { TranscriptionPageAnalysisPanelProps, TranscriptionPageAnalysisRuntimeProps, TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';
import { useTranscriptionRuntimeProps, type UseTranscriptionRuntimePropsInput } from './useTranscriptionRuntimeProps';

type AssistantSidebarObserverRecommendation = AiChatContextValue['observerRecommendations'][number];
export type AssistantSidebarObserverRecommendationInput = {
  id: string;
  priority: number;
  title: string;
  detail: string;
  actionLabel?: string;
  actionType?: AssistantSidebarObserverRecommendation['actionType'] | undefined;
  targetUnitId?: string | undefined;
  targetForm?: string | undefined;
  targetPos?: string | undefined;
  targetConfidence?: number | undefined;
};

function normalizeAssistantSidebarObserverRecommendation(
  item: AssistantSidebarObserverRecommendationInput,
): AssistantSidebarObserverRecommendation {
  const {
    actionType,
    targetUnitId,
    targetForm,
    targetPos,
    targetConfidence,
    ...rest
  } = item;

  return {
    ...rest,
    ...(actionType !== undefined ? { actionType } : {}),
    ...(targetUnitId !== undefined ? { targetUnitId } : {}),
    ...(targetForm !== undefined ? { targetForm } : {}),
    ...(targetPos !== undefined ? { targetPos } : {}),
    ...(targetConfidence !== undefined ? { targetConfidence } : {}),
  };
}

export interface UseTranscriptionAssistantSidebarControllerInput {
  locale: string;
  analysisTab: AnalysisBottomTab;
  onAnalysisTabChange: (tab: AnalysisBottomTab) => void;
  aiChatContextInput: Omit<AiChatContextSource, 'observerRecommendations'> & {
    observerRecommendations?: AssistantSidebarObserverRecommendationInput[];
  };
  runtimePropsInput: UseTranscriptionRuntimePropsInput;
}

export function useTranscriptionAssistantSidebarController(
  input: UseTranscriptionAssistantSidebarControllerInput,
) {
  const observerRecommendations = useMemo(
    () => (input.aiChatContextInput.observerRecommendations ?? []).map(normalizeAssistantSidebarObserverRecommendation),
    [input.aiChatContextInput.observerRecommendations],
  );

  const aiChatContextValue = useAiChatContextValue({
    ...input.aiChatContextInput,
    observerRecommendations,
  });

  const runtimeProps = useTranscriptionRuntimeProps(input.runtimePropsInput);
  const assistantRuntimeProps = useMemo<TranscriptionPageAssistantRuntimeProps>(() => ({
    locale: input.locale,
    aiChatContextValue,
    ...runtimeProps.assistantRuntimeProps,
  }), [aiChatContextValue, input.locale, runtimeProps.assistantRuntimeProps]);
  const analysisPanelProps = useMemo<TranscriptionPageAnalysisPanelProps>(() => ({
    locale: input.locale,
    analysisTab: input.analysisTab,
    onAnalysisTabChange: input.onAnalysisTabChange,
  }), [input.analysisTab, input.locale, input.onAnalysisTabChange]);
  const analysisRuntimeProps = useMemo<TranscriptionPageAnalysisRuntimeProps>(() => ({
    ...runtimeProps.analysisRuntimeProps,
    panel: analysisPanelProps,
  }), [analysisPanelProps, runtimeProps.analysisRuntimeProps]);

  return {
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps: runtimeProps.pdfRuntimeProps,
  };
}
