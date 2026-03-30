import { useMemo } from 'react';
import { useAiChatContextValue, type AiChatContextSource } from '../hooks/useAiChatContextValue';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import {
  useTranscriptionRuntimeProps,
  type UseTranscriptionRuntimePropsInput,
} from './useTranscriptionRuntimeProps';

type AssistantSidebarObserverRecommendation = AiChatContextValue['observerRecommendations'][number];

interface UseTranscriptionAssistantSidebarControllerInput {
  aiChatContextInput: Omit<AiChatContextSource, 'observerRecommendations'> & {
    observerRecommendations?: AssistantSidebarObserverRecommendation[];
  };
  runtimePropsInput: UseTranscriptionRuntimePropsInput;
}

export function useTranscriptionAssistantSidebarController(
  input: UseTranscriptionAssistantSidebarControllerInput,
) {
  const observerRecommendations = useMemo(
    () => (input.aiChatContextInput.observerRecommendations ?? []).map((item) => ({ ...item })),
    [input.aiChatContextInput.observerRecommendations],
  );

  const aiChatContextValue = useAiChatContextValue({
    ...input.aiChatContextInput,
    observerRecommendations,
  });

  const runtimeProps = useTranscriptionRuntimeProps(input.runtimePropsInput);

  return {
    aiChatContextValue,
    ...runtimeProps,
  };
}
