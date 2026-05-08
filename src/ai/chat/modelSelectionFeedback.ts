/**
 * PR-19: 用户反馈闭环 — 👍/👎 数据影响模型选择决策
 *
 * 轻量规则引擎，根据近期用户反馈趋势给出模型选择建议。
 * 不调用 LLM；纯状态计算。
 */

type ModelSelectionAdvice = 'keep_current' | 'downgrade_model' | 'suggest_switch';

export interface FeedbackWindow {
  thumbsUpCount: number;
  thumbsDownCount: number;
  /** 最近 N 条反馈中 thumbsDown 的连续出现次数 */
  consecutiveThumbsDown: number;
}

export interface ModelSelectionDecision {
  advice: ModelSelectionAdvice;
  reason: string;
  /** 建议的降级目标模型 ID（当 advice 为 downgrade_model 时） */
  suggestedFallbackModelId?: string;
}

/**
 * 根据反馈窗口决定模型选择策略。
 *
 * 规则：
 * - 连续 3 条 thumbs_down → downgrade_model（建议降级到更便宜的模型）
 * - 最近 10 条中 thumbs_down 比例 ≥ 50% → suggest_switch（建议用户切换模型）
 * - 其他 → keep_current
 */
export function decideModelFromFeedback(
  window: FeedbackWindow,
  currentModelId: string,
  fallbackModelId = 'fallback-light',
): ModelSelectionDecision {
  if (window.consecutiveThumbsDown >= 3) {
    return {
      advice: 'downgrade_model',
      reason: `连续 ${window.consecutiveThumbsDown} 条负面反馈，建议降级模型以降低成本并排查问题`,
      suggestedFallbackModelId: fallbackModelId,
    };
  }

  const total = window.thumbsUpCount + window.thumbsDownCount;
  if (total >= 5 && window.thumbsDownCount / total >= 0.5) {
    return {
      advice: 'suggest_switch',
      reason: `最近 ${total} 条反馈中 ${window.thumbsDownCount} 条为负面（≥50%），建议尝试其他模型`,
    };
  }

  return {
    advice: 'keep_current',
    reason: `当前模型 ${currentModelId} 反馈趋势正常（👍${window.thumbsUpCount} / 👎${window.thumbsDownCount}）`,
  };
}

/**
 * 从用户反馈序列中计算反馈窗口。
 *
 * @param ratings  按时间排序的评分序列（'thumbs_up' | 'thumbs_down'）
 * @param windowSize 窗口大小（默认 10）
 */
export function computeFeedbackWindow(
  ratings: readonly ('thumbs_up' | 'thumbs_down')[],
  windowSize = 10,
): FeedbackWindow {
  const recent = ratings.slice(-windowSize);
  let consecutiveThumbsDown = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] === 'thumbs_down') {
      consecutiveThumbsDown += 1;
    } else {
      break;
    }
  }

  return {
    thumbsUpCount: recent.filter((r) => r === 'thumbs_up').length,
    thumbsDownCount: recent.filter((r) => r === 'thumbs_down').length,
    consecutiveThumbsDown,
  };
}
