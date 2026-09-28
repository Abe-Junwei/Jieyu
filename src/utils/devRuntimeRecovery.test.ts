// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dropDevServiceWorkerRegistration,
  isStaleDevReactDispatcherError,
  reloadOnceForStaleDevReact,
} from './devRuntimeRecovery';

describe('devRuntimeRecovery', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('recognizes a null React dispatcher during dev', () => {
    expect(
      isStaleDevReactDispatcherError(
        new TypeError("Cannot read properties of null (reading 'useContext')"),
      ),
    ).toBe(true);
    expect(isStaleDevReactDispatcherError(new Error('Invalid hook call'))).toBe(true);
    expect(isStaleDevReactDispatcherError(new Error('boom-default'))).toBe(false);
  });

  it('reloads once when the page is holding a stale React copy', () => {
    const reload = vi.fn();

    expect(
      reloadOnceForStaleDevReact(
        new TypeError("Cannot read properties of null (reading 'useContext')"),
        reload,
      ),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(
      reloadOnceForStaleDevReact(
        new TypeError("Cannot read properties of null (reading 'useContext')"),
        reload,
      ),
    ).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload for an ordinary render error', () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleDevReact(new Error('boom-default'), reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('unregisters a leftover service worker and its caches once', async () => {
    const unregister = vi.fn(async () => true);
    const del = vi.fn(async () => true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: async () => [{ unregister }],
      },
    });
    vi.stubGlobal('caches', {
      keys: async () => ['jieyu-runtime-js-css'],
      delete: del,
    });

    await expect(dropDevServiceWorkerRegistration()).resolves.toBe(true);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith('jieyu-runtime-js-css');

    await expect(dropDevServiceWorkerRegistration()).resolves.toBe(false);
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('leaves boot alone when no service worker is registered', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: async () => [],
      },
    });
    await expect(dropDevServiceWorkerRegistration()).resolves.toBe(false);
  });
});
