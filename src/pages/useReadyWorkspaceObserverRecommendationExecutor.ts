import { useCallback } from 'react';

import type { ActionableRecommendation } from '../hooks/ai/useAiPanelLogic';
import { fireAndForget } from '../utils/fireAndForget';

export function useReadyWorkspaceObserverRecommendationExecutor(input: {
  actionableObserverRecommendations: readonly ActionableRecommendation[] | null | undefined;
  handleExecuteRecommendation: (match: ActionableRecommendation) => void | Promise<void>;
}): (item: { id: string }) => void {
  const { actionableObserverRecommendations, handleExecuteRecommendation } = input;

  return useCallback(
    (item: { id: string }) => {
      const match = actionableObserverRecommendations?.find(
        (candidate) => candidate.id === item.id,
      );
      if (match) {
        fireAndForget(Promise.resolve(handleExecuteRecommendation(match)), {
          context: 'src/pages/useReadyWorkspaceObserverRecommendationExecutor.ts:L16',
          policy: 'user-visible',
        });
      }
    },
    [actionableObserverRecommendations, handleExecuteRecommendation],
  );
}
