/**
 * PR-P3: Explainability DTO derived from assistant chat rows (no React).
 * See ADR-0030 vertical workflow template contract.
 */

import type { DegradationScenario } from './degradationManualOverride';

export type WorkflowExplainabilityTone = 'neutral' | 'info' | 'warning';

export interface WorkflowExplainabilityV0 {
  /** Stable machine key for dashboards (not end-user copy). */
  headlineKey: 'ok' | 'assistant_error' | 'degraded_response' | 'scope_summary_only';
  /** Scenario ids and scope hints for engineers / aggregations. */
  detailSignals: string[];
  tone: WorkflowExplainabilityTone;
  hasDegradation: boolean;
  hasSourceScopeSummary: boolean;
}

export interface WorkflowExplainabilityInput {
  degradationScenarios?: DegradationScenario[];
  sourceScopeSummary?: {
    evidenceCount: number;
    sourceTypeBreakdown: Record<string, number>;
    scopeLabel: string;
  };
  status?: 'streaming' | 'done' | 'error' | 'aborted';
  error?: string;
}

export function buildWorkflowExplainabilityFromAssistantMessage(
  msg: WorkflowExplainabilityInput,
): WorkflowExplainabilityV0 {
  const scenarios = msg.degradationScenarios ?? [];
  const detailSignals: string[] = [];
  if (msg.sourceScopeSummary && msg.status === 'done') {
    detailSignals.push(`source_scope:${msg.sourceScopeSummary.scopeLabel}`);
    detailSignals.push(`evidence_count:${String(msg.sourceScopeSummary.evidenceCount)}`);
  }
  for (const sc of scenarios) {
    detailSignals.push(`degradation:${sc}`);
  }
  const hasDegradation = scenarios.length > 0;
  const hasSourceScopeSummary = Boolean(msg.sourceScopeSummary);
  const hasError = msg.status === 'error' || (typeof msg.error === 'string' && msg.error.trim().length > 0);
  const tone: WorkflowExplainabilityTone = hasError ? 'warning' : hasDegradation ? 'info' : 'neutral';

  let headlineKey: WorkflowExplainabilityV0['headlineKey'] = 'ok';
  if (hasError) {
    headlineKey = 'assistant_error';
  } else if (hasDegradation) {
    headlineKey = 'degraded_response';
  } else if (hasSourceScopeSummary) {
    headlineKey = 'scope_summary_only';
  }

  return {
    headlineKey,
    detailSignals,
    tone,
    hasDegradation,
    hasSourceScopeSummary,
  };
}

/** Collect explainability payloads from assistant rows (e.g. for `AiRuntimeReport` rollup). */
export function collectWorkflowExplainabilitySnapshots(
  messages: ReadonlyArray<{ role: string; workflowExplainability?: WorkflowExplainabilityV0 }>,
): WorkflowExplainabilityV0[] {
  const out: WorkflowExplainabilityV0[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    if (m.workflowExplainability) out.push(m.workflowExplainability);
  }
  return out;
}

const WORKFLOW_EXPLAINABILITY_SNAPSHOT_KEY = 'workflowExplainability' as const;

/** Shape stored under `AiMessageDoc.contextSnapshot` for persistence / hydrate. */
export type WorkflowExplainabilityContextSnapshot = {
  [WORKFLOW_EXPLAINABILITY_SNAPSHOT_KEY]: WorkflowExplainabilityV0;
};

export function parseWorkflowExplainabilityFromContextSnapshot(
  contextSnapshot: unknown,
): WorkflowExplainabilityV0 | undefined {
  if (!contextSnapshot || typeof contextSnapshot !== 'object' || Array.isArray(contextSnapshot)) return undefined;
  const raw = (contextSnapshot as Record<string, unknown>)[WORKFLOW_EXPLAINABILITY_SNAPSHOT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.headlineKey !== 'string'
    || !Array.isArray(o.detailSignals)
    || typeof o.tone !== 'string'
    || typeof o.hasDegradation !== 'boolean'
    || typeof o.hasSourceScopeSummary !== 'boolean'
  ) {
    return undefined;
  }
  return {
    headlineKey: o.headlineKey as WorkflowExplainabilityV0['headlineKey'],
    detailSignals: o.detailSignals.filter((s): s is string => typeof s === 'string'),
    tone: o.tone as WorkflowExplainabilityV0['tone'],
    hasDegradation: o.hasDegradation,
    hasSourceScopeSummary: o.hasSourceScopeSummary,
  };
}

export function mergeContextSnapshotWithWorkflowExplainability(
  previous: unknown,
  dto: WorkflowExplainabilityV0,
): Record<string, unknown> {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? { ...(previous as Record<string, unknown>) }
    : {};
  return { ...base, [WORKFLOW_EXPLAINABILITY_SNAPSHOT_KEY]: dto };
}
