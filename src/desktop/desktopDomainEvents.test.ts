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
  cleanups.push(subscribeDesktopDomainEvents((event) => seen.push(event)));
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

  it('stops delivering after unsubscribe', () => {
    const seen: DesktopDomainEvent[] = [];
    const stop = subscribeDesktopDomainEvents((event) => seen.push(event));
    stop();
    emitDesktopDomainEvent(saved);
    expect(seen).toEqual([]);
  });

  it('keeps delivering when one listener throws', () => {
    cleanups.push(
      subscribeDesktopDomainEvents(() => {
        throw new Error('listener bug');
      }),
    );
    const seen = record();
    emitDesktopDomainEvent(saved);
    expect(seen).toEqual([saved]);
  });
});
