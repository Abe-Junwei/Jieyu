export type AiHybridRecommendationSignificanceReason =
  | 'locale'
  | 'page'
  | 'observerStage'
  | 'task'
  | 'rowBucket'
  | 'selectedUnitKind'
  | 'selectedLayerType'
  | 'selectedTimeRangeLabel'
  | 'selectedText'
  | 'lastToolName'
  | 'preferredMode'
  | 'confirmationThreshold'
  | 'adaptiveIntent'
  | 'adaptiveResponseStyle'
  | 'adaptiveKeywords'
  | 'providerKind'
  | 'model'
  | 'lastAcceptedPrompt';

export interface AiHybridRecommendationSignificanceConfig {
  rowBucketSize: number;
  selectedTextMaxLength: number;
  adaptiveKeywordLimit: number;
  acceptedPromptMaxLength: number;
  trackedReasons: Record<AiHybridRecommendationSignificanceReason, boolean>;
}

export interface AiHybridRecommendationSuppressionConfig {
  telemetryWindowMs: number;
  repeatPenalty: number;
  repeatedIgnorePenalty: number;
  exactAcceptanceBoost: number;
  editedAcceptanceBoost: number;
  suppressAfterRepeatedIgnores: number;
  llmCooldownAfterConsecutiveIgnores: number;
  llmCooldownWindowMs: number;
}

export interface AiHybridRecommendationServiceConfig {
  cacheTtlMs: number;
  requestDebounceMs: number;
  remoteBudgetWindowMs: number;
  maxRemoteRequestsPerWindow: number;
  significance: AiHybridRecommendationSignificanceConfig;
  suppression: AiHybridRecommendationSuppressionConfig;
}

export type AiHybridRecommendationConfigPatch = {
  cacheTtlMs?: number;
  requestDebounceMs?: number;
  remoteBudgetWindowMs?: number;
  maxRemoteRequestsPerWindow?: number;
  significance?: Omit<Partial<AiHybridRecommendationSignificanceConfig>, 'trackedReasons'> & {
    trackedReasons?: Partial<Record<AiHybridRecommendationSignificanceReason, boolean>>;
  };
  suppression?: Partial<AiHybridRecommendationSuppressionConfig>;
};

export const AI_HYBRID_RECOMMENDATION_CONFIG: AiHybridRecommendationServiceConfig = {
  cacheTtlMs: 5 * 60 * 1000,
  requestDebounceMs: 260,
  remoteBudgetWindowMs: 60_000,
  maxRemoteRequestsPerWindow: 6,
  significance: {
    rowBucketSize: 3,
    selectedTextMaxLength: 48,
    adaptiveKeywordLimit: 2,
    acceptedPromptMaxLength: 32,
    trackedReasons: {
      locale: true,
      page: true,
      observerStage: true,
      task: true,
      rowBucket: true,
      selectedUnitKind: true,
      selectedLayerType: true,
      selectedTimeRangeLabel: true,
      selectedText: true,
      lastToolName: true,
      preferredMode: true,
      confirmationThreshold: true,
      adaptiveIntent: true,
      adaptiveResponseStyle: true,
      adaptiveKeywords: true,
      providerKind: true,
      model: true,
      lastAcceptedPrompt: true,
    },
  },
  suppression: {
    telemetryWindowMs: 20 * 60 * 1000,
    repeatPenalty: 8,
    repeatedIgnorePenalty: 14,
    exactAcceptanceBoost: 18,
    editedAcceptanceBoost: 10,
    suppressAfterRepeatedIgnores: 3,
    llmCooldownAfterConsecutiveIgnores: 3,
    llmCooldownWindowMs: 15 * 60 * 1000,
  },
};

export function createAiHybridRecommendationConfig(
  patch?: AiHybridRecommendationConfigPatch,
): AiHybridRecommendationServiceConfig {
  return {
    ...AI_HYBRID_RECOMMENDATION_CONFIG,
    ...patch,
    significance: {
      ...AI_HYBRID_RECOMMENDATION_CONFIG.significance,
      ...patch?.significance,
      trackedReasons: {
        ...AI_HYBRID_RECOMMENDATION_CONFIG.significance.trackedReasons,
        ...patch?.significance?.trackedReasons,
      },
    },
    suppression: {
      ...AI_HYBRID_RECOMMENDATION_CONFIG.suppression,
      ...patch?.suppression,
    },
  };
}
