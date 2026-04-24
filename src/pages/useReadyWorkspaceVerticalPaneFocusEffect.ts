import { useEffect } from 'react';

interface UseReadyWorkspaceVerticalPaneFocusEffectInput {
  verticalViewActive: boolean;
  resetVerticalPaneFocus: () => void;
}

export function useReadyWorkspaceVerticalPaneFocusEffect(input: UseReadyWorkspaceVerticalPaneFocusEffectInput) {
  const { verticalViewActive, resetVerticalPaneFocus } = input;

  useEffect(() => {
    if (!verticalViewActive) {
      resetVerticalPaneFocus();
    }
  }, [verticalViewActive, resetVerticalPaneFocus]);
}
