import { createLogger } from '../observability/logger';

/** One event per committed single-library write. Add a type only when a write moves onto this path. */
export type DesktopDomainEvent = {
  type: 'unit.textSaved';
  sessionId: string;
  manuscriptId: string;
  unitId: string;
};

type Listener = (event: DesktopDomainEvent) => void;

const log = createLogger('desktopDomainEvents');
const listeners = new Set<Listener>();

export function subscribeDesktopDomainEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A failing listener is logged and does not stop the others. */
export function emitDesktopDomainEvent(event: DesktopDomainEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      log.error('desktop domain event listener failed', { type: event.type, err: error });
    }
  }
}

/** Emits only after the write resolves. A rejected write rethrows and emits nothing. */
export async function emitAfterWrite<T>(
  write: Promise<T>,
  toEvent: (result: T) => DesktopDomainEvent,
): Promise<T> {
  const result = await write;
  emitDesktopDomainEvent(toEvent(result));
  return result;
}
