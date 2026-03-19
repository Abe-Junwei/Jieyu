/**
 * 检索融合参数配置模板
 * Search fusion weight profiles for different scenarios
 */

export type SearchFusionScenario = 'qa' | 'review' | 'terminology' | 'balanced';

export const SEARCH_FUSION_SCENARIOS: readonly SearchFusionScenario[] = [
  'qa',
  'review',
  'terminology',
  'balanced',
];

export interface FusionWeights {
  /** 向量相似度权重（固定） | Vector similarity weight (constant) */
  vectorWeight: number;
  /** 关键词匹配权重 | Keyword matching weight */
  keywordWeight: number;
  /** 全文检索权重 | Full-text search weight */
  fullTextWeight: number;
  /** 配置说明 | Description */
  description: string;
}

/**
 * 预设的融合参数配置
 * Predefined fusion weight configurations
 *
 * 归一化说明 | Normalization:
 * - 各权重在 0-1 之间，通过后续加权融合使得最终分数在 0-1 范围内
 * - The weights are normalized after fusion calculation
 */
export const SEARCH_FUSION_PROFILES: Record<SearchFusionScenario, FusionWeights> = {
  qa: {
    vectorWeight: 0.6,
    keywordWeight: 0.25,
    fullTextWeight: 0.15,
    description: 'Q&A 模式 | Q&A mode：强调语义匹配，适合问答对话',
  },
  review: {
    vectorWeight: 0.4,
    keywordWeight: 0.35,
    fullTextWeight: 0.25,
    description: '审校模式 | Review mode：平衡三种召回，适合内容审核与复审',
  },
  terminology: {
    vectorWeight: 0.3,
    keywordWeight: 0.5,
    fullTextWeight: 0.2,
    description: '术语模式 | Terminology mode：强调精确匹配，适合术语与定义查询',
  },
  balanced: {
    vectorWeight: 0.4,
    keywordWeight: 0.35,
    fullTextWeight: 0.25,
    description: '平衡模式 | Balanced mode：通用平衡配置',
  },
};

/**
 * 判断输入是否为已知的融合场景
 * Check whether the input is a known fusion scenario
 */
export function isSearchFusionScenario(value: unknown): value is SearchFusionScenario {
  return typeof value === 'string' && SEARCH_FUSION_SCENARIOS.includes(value as SearchFusionScenario);
}

/**
 * 根据场景返回融合权重配置
 * Get fusion weights for a given scenario
 */
export function getFusionWeightsForScenario(scenario: SearchFusionScenario = 'balanced'): FusionWeights {
  return SEARCH_FUSION_PROFILES[scenario];
}

/**
 * 安全获取融合权重配置：未知场景会回退到 balanced
 * Safely resolve fusion weights and fallback to balanced for unknown scenarios
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
 * 验证权重分布是否合理
 * Validate if weight distribution is reasonable
 */
export function validateFusionWeights(weights: FusionWeights): boolean {
  if (!Number.isFinite(weights.vectorWeight)) return false;
  if (!Number.isFinite(weights.keywordWeight)) return false;
  if (!Number.isFinite(weights.fullTextWeight)) return false;
  if (weights.vectorWeight < 0 || weights.vectorWeight > 1) return false;
  if (weights.keywordWeight < 0 || weights.keywordWeight > 1) return false;
  if (weights.fullTextWeight < 0 || weights.fullTextWeight > 1) return false;

  const sum = weights.vectorWeight + weights.keywordWeight + weights.fullTextWeight;
  return sum > 0 && sum <= 1.001; // 允许小数精度误差 | Allow for floating point precision
}
