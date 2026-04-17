/**
 * AI 请求追踪中间件 — 轻量 span 模型，复用现有 metrics 基础设施
 * AI request tracing middleware — lightweight span model built on existing metrics infrastructure
 *
 * 职责：记录 LLM 请求的 TTFT、总延迟、provider/fallback、token 估算、错误分类。
 * Responsibilities: record LLM request TTFT, total latency, provider/fallback, token estimation, error classification.
 */

import { recordMetric, type MetricTags } from './metrics';

// ─── span 类型 | Span types ──────────────────────────────────────────────

export type AiTraceSpanKind = 'llm-request' | 'tool-execution' | 'agent-loop-step';

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
  tags?: MetricTags;
}

// ─── trace ID 生成 | Trace ID generation ────────────────────────────────

let traceCounter = 0;

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
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.model ? { model: options.model } : {}),
  };

  function finalize(error?: string): AiTraceSpan {
    const endMs = performance.now();
    const durationMs = Math.round(endMs - startMs);

    // 发射指标 | Emit metrics
    if (options.kind === 'llm-request') {
      recordMetric({
        id: 'ai.trace.llm_request_latency_ms',
        value: durationMs,
        tags: { ...baseTags, ...(usedFallback ? { fallback: 'true', fallback_provider: fallbackProvider ?? '' } : {}) },
      });
      if (firstTokenMs !== undefined) {
        recordMetric({
          id: 'ai.trace.llm_first_token_ms',
          value: Math.round(firstTokenMs - startMs),
          tags: baseTags,
        });
      }
      if (error) {
        recordMetric({ id: 'ai.trace.llm_request_error_count', value: 1, tags: baseTags });
      }
      if (usedFallback) {
        recordMetric({ id: 'ai.trace.llm_fallback_count', value: 1, tags: baseTags });
      }
    } else if (options.kind === 'tool-execution') {
      recordMetric({ id: 'ai.trace.tool_execution_latency_ms', value: durationMs, tags: baseTags });
    } else if (options.kind === 'agent-loop-step') {
      recordMetric({ id: 'ai.trace.agent_loop_step_latency_ms', value: durationMs, tags: baseTags });
    }

    const span: AiTraceSpan = {
      kind: options.kind,
      traceId: options.traceId,
      spanId,
      startMs,
      endMs,
      durationMs,
      usedFallback,
      ...(error ? { error } : {}),
      ...(usedFallback ? (fallbackProvider !== undefined ? { provider: fallbackProvider } : {}) : (options.provider !== undefined ? { provider: options.provider } : {})),
      ...(options.model !== undefined ? { model: options.model } : {}),
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
