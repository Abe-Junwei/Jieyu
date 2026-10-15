/**
 * Split a finished write from the screen refresh that follows it.
 * Refresh reads tables and checks constraints; its failure does not roll the write back.
 * `retryRefresh` runs only `refresh`, never the write that produced `value`.
 */

export type SettledPersistedRefresh<T> =
  | { kind: 'written-refreshed'; value: T }
  | {
      kind: 'written-refresh-pending';
      value: T;
      retryRefresh: () => Promise<SettledPersistedRefresh<T>>;
    };

export async function settlePersistedRefresh<T>(
  value: T,
  refresh: () => Promise<void>,
  onRefreshError?: (error: unknown) => void,
): Promise<SettledPersistedRefresh<T>> {
  try {
    await refresh();
    return { kind: 'written-refreshed', value };
  } catch (error) {
    onRefreshError?.(error);
    return {
      kind: 'written-refresh-pending',
      value,
      retryRefresh: () => settlePersistedRefresh(value, refresh, onRefreshError),
    };
  }
}

export type ArchiveImportOutcome =
  | { kind: 'write-unconfirmed' }
  | { kind: 'written-refreshed' }
  | { kind: 'written-refresh-pending'; retryRefresh: () => Promise<ArchiveImportOutcome> };

export async function publishAnnotationImportRefresh(input: {
  message: string;
  refresh: () => Promise<void>;
  pendingMessage: string;
  onRefreshError?: (error: unknown) => void;
  onRefreshed: () => void;
  onPending: () => void;
  pending:
    | { kind: 'written-refresh-pending' }
    | {
        kind: 'written-follow-up-unconfirmed';
        stage: 'constraint-repair' | 'duration-expand';
      };
}): Promise<AnnotationImportOutcome> {
  const settled = await settlePersistedRefresh(input.message, input.refresh, input.onRefreshError);
  if (settled.kind === 'written-refreshed' && input.pending.kind === 'written-refresh-pending') {
    input.onRefreshed();
    return { kind: 'written-refreshed' };
  }
  input.onPending();
  if (input.pending.kind === 'written-follow-up-unconfirmed') {
    return {
      kind: 'written-follow-up-unconfirmed',
      stage: input.pending.stage,
      retryRefresh: () => publishAnnotationImportRefresh(input),
    };
  }
  return {
    kind: 'written-refresh-pending',
    retryRefresh: () => publishAnnotationImportRefresh(input),
  };
}

export type AnnotationImportOutcome =
  | { kind: 'write-unconfirmed' }
  | { kind: 'written-refreshed' }
  | { kind: 'written-refresh-pending'; retryRefresh: () => Promise<AnnotationImportOutcome> }
  | {
      kind: 'written-follow-up-unconfirmed';
      stage: 'constraint-repair' | 'duration-expand';
      retryRefresh: () => Promise<AnnotationImportOutcome>;
    };

/** Project-hub mocks still return a boolean. An object counts as stored only when the write finished. */
export function projectArchiveImportStored(outcome: boolean | ArchiveImportOutcome): boolean {
  if (typeof outcome === 'boolean') return outcome;
  return outcome.kind === 'written-refreshed' || outcome.kind === 'written-refresh-pending';
}
