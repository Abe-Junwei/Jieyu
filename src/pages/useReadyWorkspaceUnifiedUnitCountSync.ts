import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { DbState } from '../hooks/transcription/transcriptionTypes';

/** Syncs `DbState.unifiedUnitCount` with the CQRS timeline read model total while `phase === 'ready'`. */
export function useReadyWorkspaceUnifiedUnitCountSync(input: {
  statePhase: DbState['phase'];
  timelineTotalCount: number;
  setState: Dispatch<SetStateAction<DbState>>;
}): void {
  const { statePhase, timelineTotalCount, setState } = input;

  useEffect(() => {
    if (statePhase !== 'ready') return;
    const nextUnifiedUnitCount = timelineTotalCount;
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      if (prev.unifiedUnitCount === nextUnifiedUnitCount) return prev;
      return {
        ...prev,
        unifiedUnitCount: nextUnifiedUnitCount,
      };
    });
  }, [setState, statePhase, timelineTotalCount]);
}
