import { afterEach, describe, expect, it } from 'vitest';
import { ensureDomParser } from './ensureDomParser';

describe('ensureDomParser (#427)', () => {
  const saved = globalThis.DOMParser;

  afterEach(() => {
    if (saved === undefined) {
      // @ts-expect-error restore missing
      delete globalThis.DOMParser;
    } else {
      globalThis.DOMParser = saved;
    }
  });

  it('installs a DOMParser when the runtime has none', () => {
    // @ts-expect-error intentional: simulate Electron main
    delete globalThis.DOMParser;
    ensureDomParser();
    expect(typeof globalThis.DOMParser).toBe('function');
    const doc = new DOMParser().parseFromString('<root><item/></root>', 'application/xml');
    expect(doc.getElementsByTagName('item').length).toBe(1);
  });

  it('leaves an existing DOMParser alone', () => {
    const sentinel = function SentinelDOMParser(this: unknown) {} as unknown as typeof DOMParser;
    globalThis.DOMParser = sentinel;
    ensureDomParser();
    expect(globalThis.DOMParser).toBe(sentinel);
  });

  it('loads linkedom when bare require is missing (#452)', () => {
    // @ts-expect-error intentional: simulate Electron main
    delete globalThis.DOMParser;
    const host = globalThis as typeof globalThis & { require?: unknown };
    const previous = Object.getOwnPropertyDescriptor(host, 'require');
    Object.defineProperty(host, 'require', {
      configurable: true,
      get() {
        throw new ReferenceError('require is not defined');
      },
    });
    try {
      ensureDomParser();
      expect(typeof globalThis.DOMParser).toBe('function');
      const doc = new DOMParser().parseFromString('<root><item/></root>', 'application/xml');
      expect(doc.getElementsByTagName('item').length).toBe(1);
    } finally {
      if (previous === undefined) {
        delete host.require;
      } else {
        Object.defineProperty(host, 'require', previous);
      }
    }
  });
});
