// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logError, logWarn } = vi.hoisted(() => ({ logError: vi.fn(), logWarn: vi.fn() }));

vi.mock('../observability/logger', () => ({
  createLogger: () => ({
    error: logError,
    warn: logWarn,
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  asyncResultFromPromise,
  FIRE_AND_FORGET_ERROR_EVENT,
  fireAndForget,
} from './fireAndForget';

describe('asyncResultFromPromise', () => {
  it('returns ok with resolved value', async () => {
    const r = await asyncResultFromPromise(Promise.resolve(42));
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('returns err with caught rejection', async () => {
    const err = new Error('nope');
    const r = await asyncResultFromPromise(Promise.reject(err));
    expect(r).toEqual({ ok: false, error: err });
  });
});

describe('fireAndForget', () => {
  beforeEach(() => {
    logError.mockClear();
    logWarn.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('logs and does not throw on background rejection', async () => {
    const p = Promise.reject(new Error('bg-fail'));
    fireAndForget(p, { context: 'test.bg', policy: 'background' });
    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalled();
    });
    const call = logError.mock.calls.find((c) => String(c[0]).includes('Unhandled async error'));
    expect(call).toBeDefined();
  });

  it('uses warn log and does not dispatch toast event for background-quiet rejection', async () => {
    const received: string[] = [];
    const onEvt = () => { received.push('evt'); };
    window.addEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);
    const p = Promise.reject(new Error('quiet-fail'));
    fireAndForget(p, { context: 'test.bq', policy: 'background-quiet' });
    try {
      await vi.waitFor(() => {
        expect(logWarn).toHaveBeenCalled();
      });
      const w = logWarn.mock.calls.find((c) => String(c[0]).includes('quiet policy'));
      expect(w).toBeDefined();
      expect(received).toHaveLength(0);
    } finally {
      window.removeEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);
    }
  });

  it('dispatches user-visible custom event on rejection', async () => {
    const received: Array<{ type: string; detail?: unknown }> = [];
    const onEvt = (e: Event) => {
      received.push({ type: e.type, detail: (e as CustomEvent).detail });
    };
    window.addEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);

    const p = Promise.reject(new Error('uv-fail'));
    fireAndForget(p, { context: 'test.uv', policy: 'user-visible' });
    try {
      await vi.waitFor(() => {
        expect(received).toHaveLength(1);
      });
      expect(received[0]!.type).toBe(FIRE_AND_FORGET_ERROR_EVENT);
      const d = received[0]!.detail as { context: string; policy: string };
      expect(d.context).toBe('test.uv');
      expect(d.policy).toBe('user-visible');
    } finally {
      window.removeEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);
    }
  });

  it('invokes onError and skips user-visible event dispatch', async () => {
    const onError = vi.fn();
    const received: string[] = [];
    const onEvt = () => {
      received.push('evt');
    };
    window.addEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);

    const err = new Error('handled');
    const p = Promise.reject(err);
    fireAndForget(p, { context: 'test.cb', policy: 'user-visible', onError });
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(err);
    });
    expect(received).toHaveLength(0);
    window.removeEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);
  });

  it('normalizes empty context to fireAndForget.unknown', async () => {
    const received: string[] = [];
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent<{ context: string }>).detail;
      if (d?.context) received.push(d.context);
    };
    window.addEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);
    const p = Promise.reject(new Error('x'));
    try {
      fireAndForget(p, { context: '   ', policy: 'user-visible' });
      await vi.waitFor(() => {
        expect(received).toContain('fireAndForget.unknown');
      });
    } finally {
      window.removeEventListener(FIRE_AND_FORGET_ERROR_EVENT, onEvt);
    }
  });
});
