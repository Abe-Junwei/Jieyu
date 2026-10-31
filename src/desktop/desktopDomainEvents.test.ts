import { afterEach, describe, expect, it } from 'vitest';
import {
  emitAfterWrite,
  emitDesktopDomainEvent,
  subscribeDesktopDomainEvents,
  type DesktopDomainEvent,
} from './desktopDomainEvents';

const saved: DesktopDomainEvent = {
  type: 'unit.textSaved',
  sessionId: 's1',
  manuscriptId: 'm1',
  unitId: 'u1',
};

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function record(): DesktopDomainEvent[] {
  const seen: DesktopDomainEvent[] = [];
  cleanups.push(
    subscribeDesktopDomainEvents((event) => {
      seen.push(event);
    }),
  );
  return seen;
}

describe('desktopDomainEvents', () => {
  it('emits after a write succeeds', async () => {
    const seen = record();
    const result = await emitAfterWrite(Promise.resolve('ok'), () => saved);
    expect(result).toBe('ok');
    expect(seen).toEqual([saved]);
  });

  it('emits nothing when the write fails', async () => {
    const seen = record();
    await expect(emitAfterWrite(Promise.reject(new Error('busy')), () => saved)).rejects.toThrow(
      'busy',
    );
    expect(seen).toEqual([]);
  });

  it('stops delivering after unsubscribe', async () => {
    const seen: DesktopDomainEvent[] = [];
    const stop = subscribeDesktopDomainEvents((event) => {
      seen.push(event);
    });
    stop();
    await emitDesktopDomainEvent(saved);
    expect(seen).toEqual([]);
  });

  it('keeps delivering when one listener throws', async () => {
    cleanups.push(
      subscribeDesktopDomainEvents(() => {
        throw new Error('listener bug');
      }),
    );
    const seen = record();
    await emitDesktopDomainEvent(saved);
    expect(seen).toEqual([saved]);
  });

  it('waits for an async listener and survives one that rejects', async () => {
    const order: string[] = [];
    cleanups.push(subscribeDesktopDomainEvents(() => Promise.reject(new Error('refetch failed'))));
    cleanups.push(
      subscribeDesktopDomainEvents(async () => {
        await Promise.resolve();
        order.push('refetched');
      }),
    );
    await emitAfterWrite(Promise.resolve('ok'), () => saved);
    order.push('returned');
    expect(order).toEqual(['refetched', 'returned']);
  });
});
