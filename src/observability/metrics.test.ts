import { describe, expect, it } from 'vitest';
import { addMetricObserver, createMetricTags, isKnownMetricId, recordDurationMetric, recordMetric, startMetricTimer, summarizeMetrics, type MetricEvent } from './metrics';

describe('metrics observability foundation', () => {
  it('records known metric and notifies observer', () => {
    const events: MetricEvent[] = [];
    const dispose = addMetricObserver((event) => events.push(event));

    const recorded = recordMetric({
      id: 'ai.chat.first_token_latency_ms',
      value: 123,
      tags: { environment: 'local', version: '1.0.0', module: 'ai-chat' },
    });

    expect(recorded.id).toBe('ai.chat.first_token_latency_ms');
    expect(events).toHaveLength(1);
    expect(events[0]?.value).toBe(123);

    dispose();
  });

  it('rejects unknown metric id', () => {
    expect(() => recordMetric({ id: 'unknown.metric.id', value: 1 })).toThrow('Unknown metric id');
  });

  it('provides timer helper that records duration metric', async () => {
    const stop = startMetricTimer('business.transcription.segment_action_latency_ms', {
      module: 'transcription',
      environment: 'test',
      version: '1.0.0',
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const event = stop();

    expect(event.id).toBe('business.transcription.segment_action_latency_ms');
    expect(event.value).toBeGreaterThanOrEqual(10);
  });

  it('summarizes p50 and p95 by metric id', () => {
    const summary = summarizeMetrics([
      { id: 'ai.chat.first_token_latency_ms', value: 100, at: '2026-04-12T00:00:00.000Z' },
      { id: 'ai.chat.first_token_latency_ms', value: 200, at: '2026-04-12T00:00:01.000Z' },
      { id: 'ai.chat.first_token_latency_ms', value: 300, at: '2026-04-12T00:00:02.000Z' },
      { id: 'business.transcription.segment_action_latency_ms', value: 20, at: '2026-04-12T00:00:00.000Z' },
      { id: 'business.transcription.segment_action_latency_ms', value: 40, at: '2026-04-12T00:00:01.000Z' },
    ]);

    const aiSummary = summary.find((item) => item.id === 'ai.chat.first_token_latency_ms');
    expect(aiSummary?.count).toBe(3);
    expect(aiSummary?.p50).toBe(200);
    expect(aiSummary?.p95).toBe(300);

    const transcriptionSummary = summary.find((item) => item.id === 'business.transcription.segment_action_latency_ms');
    expect(transcriptionSummary?.p50).toBe(20);
    expect(transcriptionSummary?.p95).toBe(40);
  });

  it('exposes known metric id checks', () => {
    expect(isKnownMetricId('ai.chat.first_token_latency_ms')).toBe(true);
    expect(isKnownMetricId('foo.bar')).toBe(false);
  });

  it('creates runtime tags with version/module/environment', () => {
    const tags = createMetricTags('ai-chat', { provider: 'mock' });

    expect(tags.module).toBe('ai-chat');
    expect(tags.provider).toBe('mock');
    expect(typeof tags.version).toBe('string');
    expect(String(tags.version).length).toBeGreaterThan(0);
    expect(typeof tags.environment).toBe('string');
    expect(String(tags.environment).length).toBeGreaterThan(0);
  });

  it('records duration metric from a start timestamp', async () => {
    const events: MetricEvent[] = [];
    const dispose = addMetricObserver((event) => events.push(event));

    const startedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const event = recordDurationMetric('business.transcription.segment_action_latency_ms', startedAt, createMetricTags('transcription'));

    expect(event.id).toBe('business.transcription.segment_action_latency_ms');
    expect(event.value).toBeGreaterThanOrEqual(5);
    expect(events).toHaveLength(1);

    dispose();
  });

  it('registers timeline CQRS / AI grounding metric ids', () => {
    expect(isKnownMetricId('ai.local_tool_result_truncated')).toBe(true);
    expect(isKnownMetricId('ai.rag_citation_read_model_miss')).toBe(true);
    expect(isKnownMetricId('ai.list_units_snapshot_created')).toBe(true);
    expect(isKnownMetricId('ai.count_claim_mismatch')).toBe(true);
    expect(isKnownMetricId('ai.timeline_unit_count_mismatch')).toBe(true);
  });
});
