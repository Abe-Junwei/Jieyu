export type SegmentLayerWriteReloadResult<T> =
  | { status: 'applied'; value: T }
  | { status: 'superseded' }
  | { status: 'viewStale'; value: T; generation: number };

export type SegmentViewRefreshPending = {
  generation: number;
  apply: () => void;
  actionLabel: string;
  failureKey: string;
};

export async function runSegmentLayerWriteReload<T>(input: {
  generation: { current: number };
  pendingView: { current: SegmentViewRefreshPending | null };
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  write: () => Promise<T>;
}): Promise<SegmentLayerWriteReloadResult<T>> {
  input.pendingView.current = null;
  input.generation.current += 1;
  const postReloadToken = input.generation.current;
  const value = await input.write();
  try {
    await input.reloadSegments();
  } catch {
    return { status: 'viewStale', value, generation: postReloadToken };
  }
  if (input.generation.current !== postReloadToken) return { status: 'superseded' };
  await input.refreshSegmentUndoSnapshot();
  return { status: 'applied', value };
}

/** Reload the view only. A throw from the undo snapshot still rejects. */
export async function refreshSegmentLayerView(input: {
  generation: { current: number };
  expectedGeneration: number;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
}): Promise<'applied' | 'superseded' | 'viewStale'> {
  if (input.generation.current !== input.expectedGeneration) return 'superseded';
  try {
    await input.reloadSegments();
  } catch {
    return 'viewStale';
  }
  if (input.generation.current !== input.expectedGeneration) return 'superseded';
  await input.refreshSegmentUndoSnapshot();
  return 'applied';
}

export function finishSegmentLayerWrite<T>(input: {
  outcome: SegmentLayerWriteReloadResult<T>;
  noteViewStale: (pending: SegmentViewRefreshPending) => void;
  actionLabel: string;
  failureKey: string;
  recordSuccess?: () => void;
  followUp?: (value: T) => void;
}): T | undefined {
  if (input.outcome.status === 'superseded') {
    input.recordSuccess?.();
    return undefined;
  }
  if (input.outcome.status === 'viewStale') {
    input.recordSuccess?.();
    const value = input.outcome.value;
    input.noteViewStale({
      generation: input.outcome.generation,
      apply: () => {
        input.followUp?.(value);
      },
      actionLabel: input.actionLabel,
      failureKey: input.failureKey,
    });
    return value;
  }
  input.followUp?.(input.outcome.value);
  input.recordSuccess?.();
  return input.outcome.value;
}
