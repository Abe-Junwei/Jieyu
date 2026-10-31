import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { subscribeDesktopDomainEvents, type DesktopDomainEvent } from './desktopDomainEvents';

/** Every desktop key starts with the session, so switching projects can drop a whole session at once. */
export const desktopQueryKeys = {
  session: (sessionId: string) => ['desktop', sessionId] as const,
  projectReads: (sessionId: string) => ['desktop', sessionId, 'projectRead'] as const,
  projectRead: (sessionId: string, manuscriptId: string | null) =>
    ['desktop', sessionId, 'projectRead', manuscriptId ?? ''] as const,
};

/**
 * The only event→invalidation table. Pages do not invalidate desktop queries themselves.
 * Saving text also clears analysis inside the same transaction; analysis keys join here when a page reads them through Query.
 */
const invalidations: {
  [Type in DesktopDomainEvent['type']]: (
    event: Extract<DesktopDomainEvent, { type: Type }>,
  ) => QueryKey[];
} = {
  'unit.textSaved': (event) => [desktopQueryKeys.projectReads(event.sessionId)],
};

export function desktopInvalidationsFor(event: DesktopDomainEvent): QueryKey[] {
  return invalidations[event.type](event);
}

export function connectDesktopInvalidation(queryClient: QueryClient): () => void {
  return subscribeDesktopDomainEvents((event) => {
    for (const queryKey of desktopInvalidationsFor(event)) {
      void queryClient.invalidateQueries({ queryKey });
    }
  });
}
