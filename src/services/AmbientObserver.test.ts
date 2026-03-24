// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmbientObserver } from './AmbientObserver';

type MutableAmbientObserverClass = {
  _instance: AmbientObserver | null;
};

function resetAmbientSingleton(): void {
  const mutable = AmbientObserver as unknown as MutableAmbientObserverClass;
  mutable._instance?.stop();
  mutable._instance = null;
}

afterEach(() => {
  resetAmbientSingleton();
  vi.restoreAllMocks();
});

describe('AmbientObserver lifecycle', () => {
  it('supports multiple subscribers and explicit unsubscribe', () => {
    const observer = AmbientObserver.getInstance();
    const callbackA = vi.fn();
    const callbackB = vi.fn();

    const unsubscribeA = observer.onEnvironmentChange(callbackA);
    observer.onEnvironmentChange(callbackB);

    window.dispatchEvent(new Event('online'));
    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).toHaveBeenCalledTimes(1);

    unsubscribeA();
    window.dispatchEvent(new Event('offline'));
    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).toHaveBeenCalledTimes(2);
  });

  it('stop detaches listeners and prevents further notifications', () => {
    const observer = AmbientObserver.getInstance();
    const callback = vi.fn();

    observer.onEnvironmentChange(callback);
    observer.stop();

    window.dispatchEvent(new Event('online'));
    expect(callback).not.toHaveBeenCalled();
  });
});
