import { describe, expect, it } from 'vitest';
import { getCommercialProviderDefinition, getSttProviderDefinition } from './index';
import { getActiveSttProviderMetadata } from './providerMetadata';

describe('commercial STT provider runtime fallbacks', () => {
  it('returns mapped provider definition for valid kind', () => {
    const def = getCommercialProviderDefinition('groq');
    expect(def.kind).toBe('groq');
  });

  it('falls back to groq definition for unknown runtime kind', () => {
    const def = getCommercialProviderDefinition('unknown-provider' as unknown as Parameters<typeof getCommercialProviderDefinition>[0]);
    expect(def.kind).toBe('groq');
  });

  it('exposes unified built-in provider metadata for whisper-local', () => {
    const def = getSttProviderDefinition('whisper-local');
    expect(def.kind).toBe('whisper-local');
    expect(def.engine).toBe('whisper-local');
    expect(def.label).toContain('Whisper');
  });

  it('resolves active commercial provider metadata through unified registry', () => {
    const def = getActiveSttProviderMetadata('commercial', 'minimax');
    expect(def.kind).toBe('minimax');
    expect(def.engine).toBe('commercial');
    expect(def.label).toContain('MiniMax');
  });
});
