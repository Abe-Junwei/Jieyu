import type { AiInteractionMetrics } from '../../hooks/useAiChat.types';

/**
 * 纯函数：对 metrics 对象中的指定数值字段增加 delta。
 * 若字段非数字，返回原对象引用（immutable）。
 */
export function bumpMetricValue(
  prev: AiInteractionMetrics,
  key: keyof AiInteractionMetrics,
  delta = 1,
): AiInteractionMetrics {
  const currentValue = prev[key];
  if (typeof currentValue !== 'number') {
    return prev;
  }
  return { ...prev, [key]: currentValue + delta };
}
