import { describe, expect, it } from 'vitest';
import { getCommercialProviderDefinition } from './index';

describe('commercial STT provider runtime fallbacks', () => {
  it('returns mapped provider definition for valid kind', () => {
    const def = getCommercialProviderDefinition('groq');
    expect(def.kind).toBe('groq');
  });

  it('falls back to groq definition for unknown runtime kind', () => {
    const def = getCommercialProviderDefinition('unknown-provider' as unknown as Parameters<typeof getCommercialProviderDefinition>[0]);
    expect(def.kind).toBe('groq');
  });
});
