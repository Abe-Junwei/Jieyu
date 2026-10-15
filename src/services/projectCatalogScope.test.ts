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

  it('falls back when randomUUID is missing', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: original.getRandomValues.bind(original) },
    });
    try {
      const id = newCatalogUuid();
      expect(id).toMatch(/^id-\d+-[a-z0-9]+$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: original,
      });
    }
  });
});
