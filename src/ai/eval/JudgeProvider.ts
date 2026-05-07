/**
 * PR-P3-2: JudgeProvider 契约 — 统一评测 provider 接口
 *
 * 当前实现为 baseline_judge（规则引擎，<500ms，无 LLM）。
 * 未来可替换为 llm_judge 或 human_judge_provider，不破坏调用方。
 */

export type JudgeKind = 'baseline_judge' | 'llm_judge' | 'human_judge_provider';

export interface JudgeProvider<Input, Result> {
  readonly kind: JudgeKind;
  readonly name: string;
  /** 单条评测 | Single-item evaluation */
  judge(input: Input): Result;
  /** 批量评测 | Batch evaluation */
  judgeBatch(inputs: Input[]): Result[];
}

export interface JudgeDimension {
  score: number;
  reasoning: string;
}

export interface JudgeResultBase {
  overallScore: number;
  reasoning: string;
}

/** 标注当前 judge 为 baseline，用于文档与报告自省 */
export function annotateBaselineJudge< Input, Result extends JudgeResultBase>(
  provider: Omit<JudgeProvider<Input, Result>, 'kind'>,
): JudgeProvider<Input, Result> {
  return { ...provider, kind: 'baseline_judge' };
}
