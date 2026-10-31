import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { emitDesktopDomainEvent } from './desktopDomainEvents';
import {
  connectDesktopInvalidation,
  desktopInvalidationsFor,
  desktopQueryKeys,
} from './desktopQueryKeys';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function connectedClient(): QueryClient {
  const client = new QueryClient();
  cleanups.push(connectDesktopInvalidation(client));
  cleanups.push(() => client.clear());
  return client;
}

const saved = {
  type: 'unit.textSaved',
  sessionId: 's1',
  manuscriptId: 'm1',
  unitId: 'u1',
} as const;

describe('desktopQueryKeys', () => {
  it('maps a saved text to the project reads of that session only', () => {
    expect(desktopInvalidationsFor(saved)).toEqual([['desktop', 's1', 'projectRead']]);
  });

  it('marks every manuscript read of the session stale and leaves other sessions alone', () => {
    const client = connectedClient();
    client.setQueryData(desktopQueryKeys.projectRead('s1', 'm1'), 'a');
    client.setQueryData(desktopQueryKeys.projectRead('s1', 'm2'), 'b');
    client.setQueryData(desktopQueryKeys.projectRead('s2', 'm1'), 'c');

    emitDesktopDomainEvent(saved);

    const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(stale(desktopQueryKeys.projectRead('s1', 'm1'))).toBe(true);
    expect(stale(desktopQueryKeys.projectRead('s1', 'm2'))).toBe(true);
    expect(stale(desktopQueryKeys.projectRead('s2', 'm1'))).toBe(false);
  });

  it('stops invalidating after disconnect', () => {
    const client = new QueryClient();
    const disconnect = connectDesktopInvalidation(client);
    client.setQueryData(desktopQueryKeys.projectRead('s1', 'm1'), 'a');
    disconnect();

    emitDesktopDomainEvent(saved);

    expect(client.getQueryState(desktopQueryKeys.projectRead('s1', 'm1'))?.isInvalidated).toBe(
      false,
    );
    client.clear();
  });

  it('keeps every desktop key under its session prefix', () => {
    expect(desktopQueryKeys.projectRead('s1', null).slice(0, 2)).toEqual(
      desktopQueryKeys.session('s1'),
    );
  });
});
