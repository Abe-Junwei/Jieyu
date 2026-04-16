import { describe, expect, it } from 'vitest';
import { AI_HYBRID_RECOMMENDATION_CONFIG, createAiHybridRecommendationConfig } from './AiHybridRecommendationConfig';

describe('AiHybridRecommendationConfig', () => {
  it('exposes centralized default thresholds', () => {
    expect(AI_HYBRID_RECOMMENDATION_CONFIG.significance.rowBucketSize).toBe(3);
    expect(AI_HYBRID_RECOMMENDATION_CONFIG.suppression.suppressAfterRepeatedIgnores).toBe(3);
    expect(AI_HYBRID_RECOMMENDATION_CONFIG.maxRemoteRequestsPerWindow).toBe(6);
  });

  it('merges nested overrides without losing tracked reasons', () => {
    const config = createAiHybridRecommendationConfig({
      significance: {
        rowBucketSize: 5,
        trackedReasons: {
          rowBucket: false,
        },
      },
      suppression: {
        repeatPenalty: 4,
      },
    });

    expect(config.significance.rowBucketSize).toBe(5);
    expect(config.significance.trackedReasons.rowBucket).toBe(false);
    expect(config.significance.trackedReasons.page).toBe(true);
    expect(config.suppression.repeatPenalty).toBe(4);
    expect(config.suppression.repeatedIgnorePenalty).toBe(14);
  });
});
