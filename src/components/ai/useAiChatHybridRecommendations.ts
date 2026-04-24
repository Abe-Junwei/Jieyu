import { useEffect, useMemo, useRef, useState } from 'react';
import { getAiChatHybridMessages } from '../../i18n/messages';
import { aiHybridRecommendationService, type AiHybridRecommendation, type AiHybridRecommendationInput } from '../../services/AiHybridRecommendationService';

interface UseAiChatHybridRecommendationsOptions extends AiHybridRecommendationInput {}

interface AiHybridRecommendationState {
  items: AiHybridRecommendation[];
  source: 'fallback' | 'llm';
  isRefreshing: boolean;
}

function buildItemsSignature(items: AiHybridRecommendation[] | null | undefined): string {
  if (!items || items.length === 0) return '';
  return items.map((item) => `${item.id}|${item.source}|${item.prompt}`).join('||');
}

function areRecommendationStatesEqual(
  left: AiHybridRecommendationState,
  right: AiHybridRecommendationState,
): boolean {
  return left.source === right.source
    && left.isRefreshing === right.isRefreshing
    && buildItemsSignature(left.items) === buildItemsSignature(right.items);
}

export function __unsafeClearAiChatHybridRecommendationCache(): void {
  aiHybridRecommendationService.clear();
}

export function useAiChatHybridRecommendations(
  input: UseAiChatHybridRecommendationsOptions,
): AiHybridRecommendationState {
  const latestInputRef = useRef(input);
  latestInputRef.current = input;
  const isZh = input.locale === 'zh-CN';
  const providerKind = input.aiChatSettings?.providerKind;
  const model = input.aiChatSettings?.model;
  const recommendationEvents = input.recommendationTelemetry?.recentEvents;
  const recommendationEventsSignature = useMemo(
    () => JSON.stringify(recommendationEvents ?? []),
    [recommendationEvents],
  );
  const messages = useMemo(() => getAiChatHybridMessages(isZh), [isZh]);
  const fallbackPrompts = useMemo(() => messages.buildFallbackRecommendations({
    ...input,
    fallback: input.primarySuggestion,
  }), [
    input.adaptiveIntent,
    input.adaptiveKeywords,
    input.adaptiveLastPromptExcerpt,
    input.adaptiveResponseStyle,
    providerKind,
    model,
    input.aiCurrentTask,
    input.annotationStatus,
    input.composerIdle,
    input.confidence,
    input.confirmationThreshold,
    input.connectionTestStatus,
    input.enabled,
    input.lastToolName,
    input.lexemeCount,
    input.locale,
    input.observerStage,
    input.page,
    input.preferredMode,
    input.primarySuggestion,
    input.rowNumber,
    input.selectedLayerType,
    input.selectedText,
    input.selectedTimeRangeLabel,
    input.selectedUnitKind,
    messages,
  ]);
  const prepared = useMemo(() => aiHybridRecommendationService.prepareRecommendationState(input, fallbackPrompts), [
    input.adaptiveIntent,
    input.adaptiveKeywords,
    input.adaptiveLastPromptExcerpt,
    input.adaptiveResponseStyle,
    providerKind,
    model,
    input.aiCurrentTask,
    input.annotationStatus,
    input.composerIdle,
    input.confidence,
    input.confirmationThreshold,
    input.connectionTestStatus,
    input.enabled,
    input.lastToolName,
    input.lexemeCount,
    input.locale,
    input.observerStage,
    input.page,
    input.preferredMode,
    input.primarySuggestion,
    input.recommendationTelemetry?.lastAcceptedPrompt,
    input.recommendationTelemetry?.lastShownPrompt,
    recommendationEventsSignature,
    input.rowNumber,
    input.selectedLayerType,
    input.selectedText,
    input.selectedTimeRangeLabel,
    input.selectedUnitKind,
    fallbackPrompts,
  ]);
  const stableFallbackItems = useMemo(
    () => prepared.fallbackItems,
    [prepared.displaySignature],
  );
  const usableCachedItems = useMemo(
    () => (prepared.shouldUseRemote ? prepared.cachedItems : null),
    [prepared.cachedItems, prepared.shouldUseRemote],
  );
  const cachedItemsSignature = useMemo(
    () => buildItemsSignature(usableCachedItems),
    [usableCachedItems],
  );
  const stableCachedItems = useMemo(
    () => usableCachedItems,
    [prepared.refinementSignature, cachedItemsSignature],
  );
  const [state, setState] = useState<AiHybridRecommendationState>(() => ({
    items: stableCachedItems ?? stableFallbackItems,
    source: stableCachedItems ? 'llm' : 'fallback',
    isRefreshing: false,
  }));

  useEffect(() => {
    if (stableCachedItems) {
      const nextState: AiHybridRecommendationState = {
        items: stableCachedItems,
        source: 'llm',
        isRefreshing: false,
      };
      setState((current) => (areRecommendationStatesEqual(current, nextState) ? current : nextState));
      return;
    }

    const nextState: AiHybridRecommendationState = {
      items: stableFallbackItems,
      source: 'fallback',
      isRefreshing: false,
    };
    setState((current) => (areRecommendationStatesEqual(current, nextState) ? current : nextState));
  }, [prepared.displaySignature, prepared.refinementSignature, stableCachedItems, stableFallbackItems]);

  useEffect(() => {
    if (!prepared.shouldUseRemote) {
      setState((current) => {
        const nextState: AiHybridRecommendationState = {
          items: stableFallbackItems,
          source: 'fallback',
          isRefreshing: false,
        };
        return areRecommendationStatesEqual(current, nextState) ? current : nextState;
      });
      return;
    }

    if (stableCachedItems) {
      setState((current) => {
        const nextState: AiHybridRecommendationState = {
          items: stableCachedItems,
          source: 'llm',
          isRefreshing: false,
        };
        return areRecommendationStatesEqual(current, nextState) ? current : nextState;
      });
      return;
    }

    const controller = new AbortController();
    const timerId = window.setTimeout(() => {
      if (!aiHybridRecommendationService.consumeRemoteBudget()) {
        setState((current) => {
          const nextState: AiHybridRecommendationState = {
            items: stableFallbackItems,
            source: 'fallback',
            isRefreshing: false,
          };
          return areRecommendationStatesEqual(current, nextState) ? current : nextState;
        });
        return;
      }

      setState((current) => {
        const nextState: AiHybridRecommendationState = {
          items: stableFallbackItems,
          source: 'fallback',
          isRefreshing: true,
        };
        return areRecommendationStatesEqual(current, nextState) ? current : nextState;
      });

      void aiHybridRecommendationService.requestRemoteRecommendations(latestInputRef.current, stableFallbackItems, controller.signal)
        .then((items) => {
          if (!items || controller.signal.aborted) return;
          aiHybridRecommendationService.setCachedRecommendations(prepared.refinementSignature, items);
          setState((current) => {
            const nextState: AiHybridRecommendationState = {
              items,
              source: 'llm',
              isRefreshing: false,
            };
            return areRecommendationStatesEqual(current, nextState) ? current : nextState;
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setState((current) => {
            const nextState: AiHybridRecommendationState = {
              items: stableFallbackItems,
              source: 'fallback',
              isRefreshing: false,
            };
            return areRecommendationStatesEqual(current, nextState) ? current : nextState;
          });
        });
    }, prepared.requestDebounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timerId);
    };
  }, [
    prepared.refinementSignature,
    prepared.remoteEligibilitySignature,
    prepared.requestDebounceMs,
    prepared.shouldUseRemote,
    stableCachedItems,
    stableFallbackItems,
  ]);

  return state;
}
