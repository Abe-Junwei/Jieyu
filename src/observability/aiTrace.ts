/**
 * AI 请求追踪中间件 — 轻量 span 模型，复用现有 metrics 基础设施
 * AI request tracing middleware — lightweight span model built on existing metrics infrastructure
 *
 * 职责：记录 LLM 请求的 TTFT、总延迟、provider/fallback、token 估算、错误分类。
 * Responsibilities: record LLM request TTFT, total latency, provider/fallback, token estimation, error classification.
 */

import { recordMetric, type MetricTags } from './metrics';

// ─── span 类型 | Span types ──────────────────────────────────────────────

type AiTraceSpanKind = 'llm-request' | 'tool-execution' | 'agent-loop-step';

type AiTraceStatusCode = 'OK' | 'ERROR';
type AiTraceAttributeValue = string | number | boolean;

export interface AiTraceSpan {
  kind: AiTraceSpanKind;
  traceId: string;
  spanId: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  provider?: string;
  model?: string;
  usedFallback?: boolean;
  error?: string;
  statusCode?: AiTraceStatusCode;
  attributes?: Record<string, AiTraceAttributeValue>;
  tags?: MetricTags;
}

// ─── trace ID 生成 | Trace ID generation ────────────────────────────────

let traceCounter = 0;

const KNOWN_TOOL_NAME_ALLOWLIST = new Set([
  'get_current_selection',
  'get_project_stats',
  'get_waveform_analysis',
  'get_acoustic_summary',
  'find_incomplete_units',
  'diagnose_quality',
  'search_units',
  'get_unit_detail',
  'get_unit_linguistic_memory',
  'list_layers',
  'list_speakers',
  'read_selection_context',
  'tool_slot_resolver',
]);

function normalizeSemanticToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  const normalized = trimmed.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : undefined;
}

function resolveToolName(tags: MetricTags | undefined): string | undefined {
  const rawValue =
    typeof tags?.toolName === 'string'
      ? tags.toolName
      : typeof tags?.tool_name === 'string'
        ? tags.tool_name
        : undefined;
  const normalized = normalizeSemanticToken(rawValue);
  if (normalized === undefined || normalized.length === 0) return undefined;
  return KNOWN_TOOL_NAME_ALLOWLIST.has(normalized) ? normalized : 'other';
}

function sanitizeUrlForAttribute(value: string): string {
  return value.replace(
    /([?&](?:api.?key|token|password|secret|authorization)=)[^&]*/gi,
    '$1[REDACTED]',
  );
}

function buildSemanticAttributes(
  kind: AiTraceSpanKind,
  provider: string | undefined,
  model: string | undefined,
  usedFallback: boolean,
  fallbackProvider: string | undefined,
  tags: MetricTags | undefined,
  error: string | undefined,
): Record<string, AiTraceAttributeValue> {
  const attributes: Record<string, AiTraceAttributeValue> = {};
  const normalizedProvider = normalizeSemanticToken(provider);
  const normalizedFallbackProvider = normalizeSemanticToken(fallbackProvider);
  const trimmedModel = model?.trim();

  if (normalizedProvider !== undefined && normalizedProvider.length > 0) {
    attributes['gen_ai.system'] = normalizedProvider;
  }
  if (trimmedModel !== undefined && trimmedModel.length > 0) {
    attributes['gen_ai.request.model'] = trimmedModel;
  }
  if (usedFallback) {
    attributes['gen_ai.jieyu.used_fallback'] = true;
    if (normalizedFallbackProvider !== undefined && normalizedFallbackProvider.length > 0) {
      attributes['gen_ai.jieyu.fallback_system'] = normalizedFallbackProvider;
    }
  }

  const toolName = resolveToolName(tags);
  if (toolName !== undefined && toolName.length > 0) {
    attributes['gen_ai.jieyu.tool_name'] = toolName;
  }

  if (typeof tags?.step === 'number' && Number.isFinite(tags.step)) {
    attributes['gen_ai.jieyu.step'] = tags.step;
  }

  const httpMethod =
    typeof tags?.httpMethod === 'string'
      ? tags.httpMethod
      : typeof tags?.method === 'string'
        ? tags.method
        : undefined;
  const normalizedHttpMethod = httpMethod?.trim();
  if (normalizedHttpMethod !== undefined && normalizedHttpMethod.length > 0) {
    attributes['http.request.method'] = normalizedHttpMethod.toUpperCase();
  }

  const rawUrl =
    typeof tags?.urlFull === 'string'
      ? tags.urlFull
      : typeof tags?.url === 'string'
        ? tags.url
        : undefined;
  const normalizedRawUrl = rawUrl?.trim();
  if (normalizedRawUrl !== undefined && normalizedRawUrl.length > 0) {
    attributes['url.full'] = sanitizeUrlForAttribute(normalizedRawUrl);
  }

  const hasError = error !== undefined && error.length > 0;
  attributes['otel.status_code'] = hasError ? 'ERROR' : 'OK';
  if (hasError) {
    attributes['otel.status_description'] = error;
  }
  const rawQueryFamily =
    typeof tags?.queryFamily === 'string' ? tags.queryFamily.trim() : undefined;
  if (kind === 'agent-loop-step' && rawQueryFamily !== undefined && rawQueryFamily.length > 0) {
    attributes['gen_ai.jieyu.query_family'] =
      normalizeSemanticToken(rawQueryFamily) ?? rawQueryFamily;
  }

  return attributes;
}

export function generateTraceId(): string {
  traceCounter += 1;
  return `tr-${Date.now().toString(36)}-${traceCounter.toString(36)}`;
}

export function generateSpanId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── 观察者 | Observers ─────────────────────────────────────────────────

export type AiTraceObserver = (span: AiTraceSpan) => void;

const traceObservers: AiTraceObserver[] = [];

export function addAiTraceObserver(observer: AiTraceObserver): () => void {
  traceObservers.push(observer);
  return () => {
    const idx = traceObservers.indexOf(observer);
    if (idx >= 0) traceObservers.splice(idx, 1);
  };
}

function notifyObservers(span: AiTraceSpan): void {
  for (const observer of traceObservers) {
    try {
      observer(span);
    } catch {
      // noop — 观察者异常不影响主链路 | Observer errors must not affect main path
    }
  }
}

// ─── span 构建器 | Span builder ──────────────────────────────────────────

export interface StartSpanOptions {
  kind: AiTraceSpanKind;
  traceId: string;
  provider?: string;
  model?: string;
  tags?: MetricTags;
}

export interface ActiveSpan {
  /** 记录首 token 时间（仅 llm-request） | Record first-token time (llm-request only) */
  markFirstToken(): void;
  /** 标记 fallback 被触发 | Mark fallback triggered */
  markFallback(fallbackProvider: string): void;
  /** 结束 span（成功） | End span (success) */
  end(): AiTraceSpan;
  /** 结束 span（失败） | End span (error) */
  endWithError(error: string): AiTraceSpan;
}

export function startAiTraceSpan(options: StartSpanOptions): ActiveSpan {
  const spanId = generateSpanId();
  const startMs = performance.now();
  let firstTokenMs: number | undefined;
  let usedFallback = false;
  let fallbackProvider: string | undefined;

  const baseTags: MetricTags = {
    ...(options.tags ?? {}),
    ...(options.provider !== undefined && options.provider.length > 0
      ? { provider: options.provider }
      : {}),
    ...(options.model !== undefined && options.model.length > 0 ? { model: options.model } : {}),
  };

  function finalize(error?: string): AiTraceSpan {
    const endMs = performance.now();
    const durationMs = Math.round(endMs - startMs);

    // 发射指标 | Emit metrics
    if (options.kind === 'llm-request') {
      recordMetric({
        id: 'ai.trace.llm_request_latency_ms',
        value: durationMs,
        tags: {
          ...baseTags,
          ...(usedFallback ? { fallback: 'true', fallback_provider: fallbackProvider ?? '' } : {}),
        },
      });
      if (firstTokenMs !== undefined) {
        recordMetric({
          id: 'ai.trace.llm_first_token_ms',
          value: Math.round(firstTokenMs - startMs),
          tags: baseTags,
        });
      }
      if (error !== undefined && error.length > 0) {
        recordMetric({ id: 'ai.trace.llm_request_error_count', value: 1, tags: baseTags });
      }
      if (usedFallback) {
        recordMetric({ id: 'ai.trace.llm_fallback_count', value: 1, tags: baseTags });
      }
    } else if (options.kind === 'tool-execution') {
      recordMetric({ id: 'ai.trace.tool_execution_latency_ms', value: durationMs, tags: baseTags });
    } else if (options.kind === 'agent-loop-step') {
      recordMetric({
        id: 'ai.trace.agent_loop_step_latency_ms',
        value: durationMs,
        tags: baseTags,
      });
    }

    const resolvedProvider = usedFallback ? fallbackProvider : options.provider;
    const semanticAttributes = buildSemanticAttributes(
      options.kind,
      options.provider,
      options.model,
      usedFallback,
      fallbackProvider,
      baseTags,
      error,
    );

    const span: AiTraceSpan = {
      kind: options.kind,
      traceId: options.traceId,
      spanId,
      startMs,
      endMs,
      durationMs,
      usedFallback,
      ...(error !== undefined && error.length > 0 ? { error } : {}),
      statusCode: error !== undefined && error.length > 0 ? 'ERROR' : 'OK',
      ...(resolvedProvider !== undefined ? { provider: resolvedProvider } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
      attributes: semanticAttributes,
      tags: baseTags,
    };

    notifyObservers(span);
    return span;
  }

  return {
    markFirstToken() {
      if (firstTokenMs === undefined) firstTokenMs = performance.now();
    },
    markFallback(fbProvider: string) {
      usedFallback = true;
      fallbackProvider = fbProvider;
    },
    end: () => finalize(),
    endWithError: (error: string) => finalize(error),
  };
}
