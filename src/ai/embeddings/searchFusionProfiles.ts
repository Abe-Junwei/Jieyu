/**
 * Search fusion weight profiles for different scenarios.
 */

export type SearchFusionScenario = 'qa' | 'review' | 'terminology' | 'balanced';

export const SEARCH_FUSION_SCENARIOS: readonly SearchFusionScenario[] = [
  'qa',
  'review',
  'terminology',
  'balanced',
];

export interface FusionWeights {
  /** Vector similarity weight (constant). */
  vectorWeight: number;
  /** Keyword matching weight. */
  keywordWeight: number;
  /** Full-text search weight. */
  fullTextWeight: number;
  /** Description. */
  description: string;
}

/**
 * Predefined fusion weight configurations.
 *
 * Normalization:
 * - Each weight remains within 0-1 and the final score stays within 0-1 after fusion.
 * - The weights are normalized after fusion calculation
 */
export const SEARCH_FUSION_PROFILES: Record<SearchFusionScenario, FusionWeights> = {
  qa: {
    vectorWeight: 0.6,
    keywordWeight: 0.25,
    fullTextWeight: 0.15,
    description: 'Q&A \u6a21\u5f0f | Q&A mode\uff1a\u5f3a\u8c03\u8bed\u4e49\u5339\u914d\uff0c\u9002\u5408\u95ee\u7b54\u5bf9\u8bdd',
  },
  review: {
    vectorWeight: 0.4,
    keywordWeight: 0.35,
    fullTextWeight: 0.25,
    description: '\u5ba1\u6821\u6a21\u5f0f | Review mode\uff1a\u5e73\u8861\u4e09\u79cd\u53ec\u56de\uff0c\u9002\u5408\u5185\u5bb9\u5ba1\u6838\u4e0e\u590d\u5ba1',
  },
  terminology: {
    vectorWeight: 0.3,
    keywordWeight: 0.5,
    fullTextWeight: 0.2,
    description: '\u672f\u8bed\u6a21\u5f0f | Terminology mode\uff1a\u5f3a\u8c03\u7cbe\u786e\u5339\u914d\uff0c\u9002\u5408\u672f\u8bed\u4e0e\u5b9a\u4e49\u67e5\u8be2',
  },
  balanced: {
    vectorWeight: 0.4,
    keywordWeight: 0.35,
    fullTextWeight: 0.25,
    description: '\u5e73\u8861\u6a21\u5f0f | Balanced mode\uff1a\u901a\u7528\u5e73\u8861\u914d\u7f6e',
  },
};

/**
 * Check whether the input is a known fusion scenario.
 */
export function isSearchFusionScenario(value: unknown): value is SearchFusionScenario {
  return typeof value === 'string' && SEARCH_FUSION_SCENARIOS.includes(value as SearchFusionScenario);
}

/**
 * Get fusion weights for a given scenario.
 */
export function getFusionWeightsForScenario(scenario: SearchFusionScenario = 'balanced'): FusionWeights {
  return SEARCH_FUSION_PROFILES[scenario];
}

/**
 * Safely resolve fusion weights and fallback to balanced for unknown scenarios.
 */
export function resolveFusionWeightsForScenario(
  scenario: SearchFusionScenario | string | null | undefined,
): FusionWeights {
  if (isSearchFusionScenario(scenario)) {
    return getFusionWeightsForScenario(scenario);
  }
  return getFusionWeightsForScenario('balanced');
}

/**
 * Validate whether the weight distribution is reasonable.
 */
export function validateFusionWeights(weights: FusionWeights): boolean {
  if (!Number.isFinite(weights.vectorWeight)) return false;
  if (!Number.isFinite(weights.keywordWeight)) return false;
  if (!Number.isFinite(weights.fullTextWeight)) return false;
  if (weights.vectorWeight < 0 || weights.vectorWeight > 1) return false;
  if (weights.keywordWeight < 0 || weights.keywordWeight > 1) return false;
  if (weights.fullTextWeight < 0 || weights.fullTextWeight > 1) return false;

  const sum = weights.vectorWeight + weights.keywordWeight + weights.fullTextWeight;
  return sum > 0 && sum <= 1.001; // Allow for floating point precision.
}
