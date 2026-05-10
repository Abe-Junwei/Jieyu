import { useCallback } from 'react';

/**
 * Thin adapters around segment mutation + read-model reload, kept out of the ReadyWorkspace shell.
 * ADR-0026: `silentSegmentGraphSyncForAi` must keep the same reload pipeline as other segment mutations.
 */
export function useReadyWorkspaceSegmentMutationAdapters(input: {
  splitRouted: (id: string, splitTime: number, layerIdOverride?: string) => Promise<unknown>;
  reloadSegments: () => Promise<unknown>;
  refreshSegmentUndoSnapshot: () => Promise<unknown>;
  reloadSegmentContents: () => Promise<unknown>;
}): {
  splitRoutedVoidResult: (id: string, splitTime: number, layerIdOverride?: string) => Promise<void>;
  silentSegmentGraphSyncForAi: () => Promise<void>;
} {
  const { splitRouted, reloadSegments, refreshSegmentUndoSnapshot, reloadSegmentContents } = input;

  const splitRoutedVoidResult = useCallback(
    async (id: string, splitTime: number, layerIdOverride?: string) => {
      await splitRouted(id, splitTime, layerIdOverride);
    },
    [splitRouted],
  );

  const silentSegmentGraphSyncForAi = useCallback(async () => {
    await reloadSegments();
    await refreshSegmentUndoSnapshot();
    await reloadSegmentContents();
  }, [reloadSegments, refreshSegmentUndoSnapshot, reloadSegmentContents]);

  return { splitRoutedVoidResult, silentSegmentGraphSyncForAi };
}
