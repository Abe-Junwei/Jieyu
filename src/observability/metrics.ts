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
