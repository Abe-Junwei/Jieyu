import { createLogger } from '../observability/logger';

/** One event per committed single-library write. Add a type only when a write moves onto this path. */
export type DesktopDomainEvent = {
  type: 'unit.textSaved';
  sessionId: string;
  manuscriptId: string;
  unitId: string;
};

/** A listener may return a promise; `emitAfterWrite` waits for it (e.g. the refetch after invalidation). */
type Listener = (event: DesktopDomainEvent) => void | Promise<unknown>;

const log = createLogger('desktopDomainEvents');
const listeners = new Set<Listener>();

export function subscribeDesktopDomainEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A failing listener is logged and does not stop the others. Resolves false when any listener failed. */
export async function emitDesktopDomainEvent(event: DesktopDomainEvent): Promise<boolean> {
  let refreshed = true;
  const pending: Promise<unknown>[] = [];
  const note = (error: unknown) => {
    refreshed = false;
    fail(event, error);
  };
  for (const listener of [...listeners]) {
    try {
      const result = listener(event);
      if (result instanceof Promise) pending.push(result.catch(note));
    } catch (error) {
      note(error);
    }
  }
  await Promise.all(pending);
  return refreshed;
}

function fail(event: DesktopDomainEvent, error: unknown): void {
  log.error('desktop domain event listener failed', { type: event.type, err: error });
}

/** Emits only after the write resolves, then waits for listeners. A rejected write rethrows and emits nothing. */
export async function emitAfterWrite<T>(
  write: Promise<T>,
  toEvent: (result: T) => DesktopDomainEvent,
): Promise<{ value: T; refreshed: boolean }> {
  const value = await write;
  const refreshed = await emitDesktopDomainEvent(toEvent(value));
  return { value, refreshed };
}
