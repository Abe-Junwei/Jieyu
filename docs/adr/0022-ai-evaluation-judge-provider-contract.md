---
title: ADR-0022 — AI Evaluation Judge Provider Contract
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-05-07
source_of_truth: decision-record
---

# ADR-0022: AI Evaluation Judge Provider Contract

## Status

Accepted

## Context

PR-14 (Citation Accuracy Judge) and PR-19 (Relevance Judge) are rule-based baselines.
They run in <500ms with zero LLM calls, satisfying CI gate constraints.
However, the calling code depends directly on `judgeCitationAccuracy()` and `judgeRelevance()`
functions, making future migration to LLM-as-Judge or human-in-the-loop evaluation expensive.

We need a provider contract so that:
- Baseline judges ship today without blocking product work.
- LLM judges can be swapped in later without touching every call site.
- Runtime reports aggregate results from any judge kind uniformly.

## Decision

Introduce `JudgeProvider<Input, Result>` interface in `src/ai/eval/JudgeProvider.ts`.

### Contract

```ts
export type JudgeKind = 'baseline_judge' | 'llm_judge' | 'human_judge_provider';

export interface JudgeProvider<Input, Result extends JudgeResultBase> {
  readonly kind: JudgeKind;
  readonly name: string;
  judge(input: Input): Result;
  judgeBatch(inputs: Input[]): Result[];
}
```

- `baseline_judge`: rule engine, <500ms, no LLM, deterministic.
- `llm_judge`: LLM-as-Judge, slower, non-deterministic, higher fidelity.
- `human_judge_provider`: human rater queue, async, ground-truth quality.

### Current implementations

| Provider | Kind | File |
|---|---|---|
| `citationJudgeProvider` | `baseline_judge` | `src/ai/eval/citationJudge.ts` |
| `relevanceJudgeProvider` | `baseline_judge` | `src/ai/eval/relevanceJudge.ts` |

Both implement `JudgeProvider<..., ...>` via `annotateBaselineJudge(...)` helper.

## Consequences

- **Positive**: Swappable judge backends; runtime reports decoupled from scoring implementation.
- **Positive**: Skip taxonomy and runtime metrics can inspect `kind` to explain score provenance.
- **Negative**: Slightly more boilerplate when adding a new dimension (must wrap in provider).
- **Risk**: If `Result` shape diverges too much between kinds, the generic contract becomes leaky.
  Mitigation: `JudgeResultBase` enforces `overallScore` and `reasoning` as universal fields.

## Related

- PR-14: Citation Accuracy Judge
- PR-19: Relevance Judge
- PR-P3-2: JudgeProvider contract + ADR
