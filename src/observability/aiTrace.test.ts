import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  generateTraceId,
  generateSpanId,
  startAiTraceSpan,
  addAiTraceObserver,
  type AiTraceSpan,
} from './aiTrace';
import { addMetricObserver, type MetricEvent } from './metrics';

describe('aiTrace', () => {
  test('generateTraceId 返回唯一值 | returns unique values', () => {
    const a = generateTraceId();
    const b = generateTraceId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^tr-/);
  });

  test('generateSpanId 返回 8+ 字符 | returns 8+ char string', () => {
    const id = generateSpanId();
    expect(id.length).toBeGreaterThanOrEqual(8);
  });

  describe('startAiTraceSpan', () => {
    let collectedMetrics: MetricEvent[];
    let removeMetricObserver: () => void;

    beforeEach(() => {
      collectedMetrics = [];
      removeMetricObserver = addMetricObserver((event) => collectedMetrics.push(event));
    });

    // 清理 | Cleanup
    afterEach(() => {
      removeMetricObserver();
    });

    test('llm-request span 记录延迟与首 token | records latency and TTFT', () => {
      const span = startAiTraceSpan({
        kind: 'llm-request',
        traceId: 'test-trace-1',
        provider: 'mock',
        model: 'test-model',
      });

      span.markFirstToken();
      const result = span.end();

      expect(result.kind).toBe('llm-request');
      expect(result.traceId).toBe('test-trace-1');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.provider).toBe('mock');
      expect(result.usedFallback).toBe(false);

      // 应发射延迟 + TTFT 两个指标 | Should emit latency + TTFT metrics
      const latencyMetric = collectedMetrics.find((m) => m.id === 'ai.trace.llm_request_latency_ms');
      const ttftMetric = collectedMetrics.find((m) => m.id === 'ai.trace.llm_first_token_ms');
      expect(latencyMetric).toBeDefined();
      expect(ttftMetric).toBeDefined();
    });

    test('llm-request span 错误时记录错误计数 | records error count on failure', () => {
      const span = startAiTraceSpan({
        kind: 'llm-request',
        traceId: 'test-trace-2',
        provider: 'mock',
      });

      const result = span.endWithError('Rate limit exceeded');
      expect(result.error).toBe('Rate limit exceeded');

      const errorMetric = collectedMetrics.find((m) => m.id === 'ai.trace.llm_request_error_count');
      expect(errorMetric).toBeDefined();
      expect(errorMetric!.value).toBe(1);
    });

    test('fallback 触发时记录 fallback 计数 | records fallback count', () => {
      const span = startAiTraceSpan({
        kind: 'llm-request',
        traceId: 'test-trace-3',
        provider: 'primary',
      });

      span.markFallback('secondary');
      const result = span.end();

      expect(result.usedFallback).toBe(true);
      expect(result.provider).toBe('secondary');

      const fallbackMetric = collectedMetrics.find((m) => m.id === 'ai.trace.llm_fallback_count');
      expect(fallbackMetric).toBeDefined();
    });

    test('tool-execution span 记录延迟 | tool-execution records latency', () => {
      const span = startAiTraceSpan({
        kind: 'tool-execution',
        traceId: 'test-trace-4',
      });
      span.end();

      const metric = collectedMetrics.find((m) => m.id === 'ai.trace.tool_execution_latency_ms');
      expect(metric).toBeDefined();
    });

    test('agent-loop-step span 记录延迟 | agent-loop-step records latency', () => {
      const span = startAiTraceSpan({
        kind: 'agent-loop-step',
        traceId: 'test-trace-5',
      });
      span.end();

      const metric = collectedMetrics.find((m) => m.id === 'ai.trace.agent_loop_step_latency_ms');
      expect(metric).toBeDefined();
    });
  });

  describe('addAiTraceObserver', () => {
    test('观察者收到完成的 span | observer receives completed span', () => {
      const observed: AiTraceSpan[] = [];
      const remove = addAiTraceObserver((s) => observed.push(s));

      const span = startAiTraceSpan({
        kind: 'llm-request',
        traceId: 'obs-test',
        provider: 'mock',
      });
      span.end();

      expect(observed).toHaveLength(1);
      expect(observed[0]!.traceId).toBe('obs-test');
      remove();
    });

    test('移除后不再通知 | no notifications after removal', () => {
      const observed: AiTraceSpan[] = [];
      const remove = addAiTraceObserver((s) => observed.push(s));
      remove();

      const span = startAiTraceSpan({
        kind: 'llm-request',
        traceId: 'removed-obs',
        provider: 'mock',
      });
      span.end();

      expect(observed).toHaveLength(0);
    });
  });
});
