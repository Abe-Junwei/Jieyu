import { describe, expect, it, vi } from 'vitest';
import { newCatalogUuid } from './projectCatalogScope';

describe('newCatalogUuid', () => {
  it('uses crypto.randomUUID when available', () => {
    const spy = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111');
    expect(newCatalogUuid()).toBe('11111111-1111-4111-8111-111111111111');
    spy.mockRestore();
  });

  it('falls back to a v4 UUID from getRandomValues when randomUUID is missing', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: original.getRandomValues.bind(original) },
    });
    try {
      const id = newCatalogUuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(newCatalogUuid()).not.toBe(id);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: original,
      });
    }
  });
});
