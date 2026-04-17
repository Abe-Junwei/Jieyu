export type MetricCategory = 'ux' | 'business' | 'ai';
export type MetricKind = 'histogram' | 'counter' | 'ratio';
export type MetricUnit = 'ms' | 'count' | 'ratio';

export interface MetricDefinition {
  id: string;
  category: MetricCategory;
  module: string;
  kind: MetricKind;
  unit: MetricUnit;
  description: string;
  targetP95?: number;
}

export type MetricTagValue = string | number | boolean;
export type MetricTags = Record<string, MetricTagValue>;

export interface MetricEvent {
  id: string;
  value: number;
  at: string;
  tags?: MetricTags;
}

export type MetricObserver = (event: MetricEvent) => void;

export const M5_METRIC_CATALOG: ReadonlyArray<MetricDefinition> = [
  {
    id: 'ux.web_vitals.lcp_ms',
    category: 'ux',
    module: 'shell',
    kind: 'histogram',
    unit: 'ms',
    description: 'Largest Contentful Paint latency.',
  },
  {
    id: 'business.transcription.segment_action_latency_ms',
    category: 'business',
    module: 'transcription',
    kind: 'histogram',
    unit: 'ms',
    description: 'Latency of split/merge/save segment actions.',
    targetP95: 300,
  },
  {
    id: 'business.e2e.main_path_success_rate',
    category: 'business',
    module: 'release-gate',
    kind: 'ratio',
    unit: 'ratio',
    description: 'Main path E2E success ratio.',
    targetP95: 0.99,
  },
  {
    id: 'ai.chat.first_token_latency_ms',
    category: 'ai',
    module: 'ai-chat',
    kind: 'histogram',
    unit: 'ms',
    description: 'Latency from send to first token.',
    targetP95: 8000,
  },
  {
    id: 'ai.chat.completion_success_count',
    category: 'ai',
    module: 'ai-chat',
    kind: 'counter',
    unit: 'count',
    description: 'Count of successfully completed chat turns.',
  },
  {
    id: 'ai.timeline_unit_count_mismatch',
    category: 'ai',
    module: 'timeline-unit-view',
    kind: 'counter',
    unit: 'count',
    description: 'Mismatch between unit counts across prompt, tools, and read model.',
  },
  {
    id: 'ai.local_tool_result_truncated',
    category: 'ai',
    module: 'local-context-tools',
    kind: 'counter',
    unit: 'count',
    description: 'Local context tool JSON formatted for the model exceeded the char budget and was truncated.',
  },
  {
    id: 'ai.rag_citation_read_model_miss',
    category: 'ai',
    module: 'ai-chat-rag',
    kind: 'counter',
    unit: 'count',
    description: 'RAG unit citation refId was not present in localUnitIndex at retrieval (possible stale embedding hit).',
  },
  {
    id: 'ai.list_units_snapshot_created',
    category: 'ai',
    module: 'local-context-tools',
    kind: 'counter',
    unit: 'count',
    description: 'list_units created an in-memory snapshot for paging (large localUnitIndex).',
  },
  {
    id: 'ai.count_claim_mismatch',
    category: 'ai',
    module: 'ai-chat',
    kind: 'counter',
    unit: 'count',
    description: 'Assistant count claim mismatched authoritative project stats.',
  },
  {
    id: 'ai.segment_only_project_context_build',
    category: 'ai',
    module: 'transcription-ai',
    kind: 'counter',
    unit: 'count',
    description: 'Prompt context built from segment-only project state.',
  },
  {
    id: 'ai.hybrid_intent_resolved',
    category: 'ai',
    module: 'hybrid-intent',
    kind: 'counter',
    unit: 'count',
    description: 'Hybrid intent resolver successfully parsed a structured intent via LLM.',
  },
  {
    id: 'ai.hybrid_intent_timeout',
    category: 'ai',
    module: 'hybrid-intent',
    kind: 'counter',
    unit: 'count',
    description: 'Hybrid intent resolver timed out before receiving a complete response.',
  },
  {
    id: 'ai.local_tool_clarification_needed',
    category: 'ai',
    module: 'ai-chat',
    kind: 'counter',
    unit: 'count',
    description: 'Local tool execution was paused to request clarification for ambiguous metric/query/target.',
  },
  // ─── AI trace span 指标 | AI trace span metrics ───────────────────────
  {
    id: 'ai.trace.llm_request_latency_ms',
    category: 'ai',
    module: 'ai-trace',
    kind: 'histogram',
    unit: 'ms',
    description: 'Total wall-clock latency of a single LLM request (primary or after fallback).',
    targetP95: 15_000,
  },
  {
    id: 'ai.trace.llm_first_token_ms',
    category: 'ai',
    module: 'ai-trace',
    kind: 'histogram',
    unit: 'ms',
    description: 'Time from request start to first streamed token.',
    targetP95: 8_000,
  },
  {
    id: 'ai.trace.llm_request_error_count',
    category: 'ai',
    module: 'ai-trace',
    kind: 'counter',
    unit: 'count',
    description: 'Count of LLM requests that ended with an error.',
  },
  {
    id: 'ai.trace.llm_fallback_count',
    category: 'ai',
    module: 'ai-trace',
    kind: 'counter',
    unit: 'count',
    description: 'Count of LLM requests that fell back to secondary provider.',
  },
  {
    id: 'ai.trace.tool_execution_latency_ms',
    category: 'ai',
    module: 'ai-trace',
    kind: 'histogram',
    unit: 'ms',
    description: 'Wall-clock latency of a single tool execution within the agent loop.',
  },
  {
    id: 'ai.trace.agent_loop_step_latency_ms',
    category: 'ai',
    module: 'ai-trace',
    kind: 'histogram',
    unit: 'ms',
    description: 'Wall-clock latency of one agent loop step (stream + tool resolution).',
  },
] as const;

const METRIC_ID_SET = new Set(M5_METRIC_CATALOG.map((item) => item.id));
const observers: MetricObserver[] = [];

export function addMetricObserver(observer: MetricObserver): () => void {
  observers.push(observer);
  return () => {
    const index = observers.indexOf(observer);
    if (index >= 0) observers.splice(index, 1);
  };
}

export function isKnownMetricId(id: string): boolean {
  return METRIC_ID_SET.has(id);
}

function normalizeMetricEnvironment(rawValue: string | undefined): string {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) return import.meta.env.DEV ? 'local' : 'prod';
  if (normalized === 'development' || normalized === 'dev') return 'local';
  if (normalized === 'production') return 'prod';
  return normalized;
}

export function getMetricEnvironmentTag(): string {
  return normalizeMetricEnvironment(import.meta.env.VITE_M5_OBSERVABILITY_ENV ?? import.meta.env.MODE);
}

export function getMetricVersionTag(): string {
  const envVersion = import.meta.env.VITE_APP_VERSION?.trim();
  if (envVersion) return envVersion;
  const sentryRelease = import.meta.env.VITE_SENTRY_RELEASE?.trim();
  if (sentryRelease) return sentryRelease;
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim()) return __APP_VERSION__.trim();
  return '0.0.0-dev';
}

export function createMetricTags(moduleName: string, extraTags?: MetricTags): MetricTags {
  return {
    version: getMetricVersionTag(),
    module: moduleName,
    environment: getMetricEnvironmentTag(),
    ...(extraTags ?? {}),
  };
}

export function recordMetric(input: Omit<MetricEvent, 'at'> & { at?: string }): MetricEvent {
  if (!isKnownMetricId(input.id)) {
    throw new Error(`Unknown metric id: ${input.id}`);
  }
  if (!Number.isFinite(input.value)) {
    throw new Error(`Metric value must be finite: ${input.id}`);
  }
  const event: MetricEvent = {
    id: input.id,
    value: input.value,
    at: input.at ?? new Date().toISOString(),
    ...(input.tags ? { tags: input.tags } : {}),
  };

  for (const observer of observers) {
    try {
      observer(event);
    } catch {
      // noop
    }
  }
  return event;
}

export function recordDurationMetric(id: string, startedAtMs: number, tags?: MetricTags): MetricEvent {
  const durationMs = Math.max(0, Math.round(performance.now() - startedAtMs));
  return recordMetric({
    id,
    value: durationMs,
    ...(tags ? { tags } : {}),
  });
}

export function startMetricTimer(id: string, tags?: MetricTags): () => MetricEvent {
  const startAt = performance.now();
  return () => {
    const value = Math.round(performance.now() - startAt);
    return recordMetric({
      id,
      value,
      ...(tags !== undefined ? { tags } : {}),
    });
  };
}

function quantile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(ratio * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

export interface MetricSummary {
  id: string;
  count: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

export function summarizeMetrics(events: readonly MetricEvent[]): MetricSummary[] {
  const grouped = new Map<string, number[]>();
  for (const event of events) {
    const bucket = grouped.get(event.id);
    if (bucket) bucket.push(event.value);
    else grouped.set(event.id, [event.value]);
  }

  const summaries: MetricSummary[] = [];
  for (const [id, values] of grouped.entries()) {
    const sorted = [...values].sort((left, right) => left - right);
    summaries.push({
      id,
      count: sorted.length,
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    });
  }

  return summaries.sort((left, right) => left.id.localeCompare(right.id));
}
