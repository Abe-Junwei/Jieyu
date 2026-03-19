import { describe, expect, it } from 'vitest';
import {
  SEARCH_FUSION_PROFILES,
  SEARCH_FUSION_SCENARIOS,
  getFusionWeightsForScenario,
  isSearchFusionScenario,
  resolveFusionWeightsForScenario,
  validateFusionWeights,
} from './searchFusionProfiles';

describe('searchFusionProfiles', () => {
  it('exposes all expected scenarios', () => {
    expect(SEARCH_FUSION_SCENARIOS).toEqual(['qa', 'review', 'terminology', 'balanced']);
  });

  it('recognizes valid scenarios', () => {
    expect(isSearchFusionScenario('qa')).toBe(true);
    expect(isSearchFusionScenario('review')).toBe(true);
    expect(isSearchFusionScenario('invalid')).toBe(false);
    expect(isSearchFusionScenario(undefined)).toBe(false);
  });

  it('returns profile weights for a known scenario', () => {
    const qa = getFusionWeightsForScenario('qa');
    expect(qa).toEqual(SEARCH_FUSION_PROFILES.qa);
  });

  it('falls back to balanced for unknown scenario inputs', () => {
    const resolved = resolveFusionWeightsForScenario('unknown-scenario');
    expect(resolved).toEqual(SEARCH_FUSION_PROFILES.balanced);
  });

  it('accepts valid normalized weights', () => {
    expect(validateFusionWeights({
      vectorWeight: 0.4,
      keywordWeight: 0.35,
      fullTextWeight: 0.25,
      description: 'ok',
    })).toBe(true);
  });

  it('rejects out-of-range or invalid weights', () => {
    expect(validateFusionWeights({
      vectorWeight: -0.1,
      keywordWeight: 0.6,
      fullTextWeight: 0.5,
      description: 'bad',
    })).toBe(false);

    expect(validateFusionWeights({
      vectorWeight: 0.8,
      keywordWeight: 0.5,
      fullTextWeight: 0.4,
      description: 'sum > 1',
    })).toBe(false);

    expect(validateFusionWeights({
      vectorWeight: Number.NaN,
      keywordWeight: 0.5,
      fullTextWeight: 0.5,
      description: 'nan',
    })).toBe(false);
  });
});
