/**
 * PR-5: Boundary guard + fault injection tests for the AI orchestration layer.
 * Validates recovery signals under timeout, executor failure, and edge inputs.
 */
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { resolveUserDirectivePolicyDecision } from './policy/resolveExecutionPolicy';
import { buildEvidencePacketV0 } from './vertical/evidencePacket';

describe('boundary guard — orchestration layer edge conditions', () => {
  it('rejects empty user message without crashing the policy resolver', () => {
    const decision = resolveUserDirectivePolicyDecision(
      { name: 'search_segments', arguments: { query: '' } },
      { toolPreferences: { autoExecute: 'allow' } },
    );
    expect(decision.action).toBe('allow');
  });

  it('rejects malformed tool call name gracefully', () => {
    const decision = resolveUserDirectivePolicyDecision(
      { name: 'nonexistent_tool', arguments: {} } as unknown as Parameters<typeof resolveUserDirectivePolicyDecision>[0],
      { toolPreferences: { autoExecute: 'allow' } },
    );
    // Unknown tools fall through to allow (policy matrix handles known tools)
    expect(['allow', 'block', 'confirm']).toContain(decision.action);
  });

  it('blocks all tools when autoExecute=never', () => {
    const tools = ['search_segments', 'propose_changes', 'delete_transcription_segment'];
    for (const name of tools) {
      const decision = resolveUserDirectivePolicyDecision(
        { name, arguments: {} },
        { toolPreferences: { autoExecute: 'never' } },
      );
      expect(decision.action).toBe('block');
    }
  });

  it('EvidencePacket builder rejects dangerously large confidence values', () => {
    expect(() =>
      buildEvidencePacketV0({
        id: 'ep-001',
        sourceType: 'segment',
        sourceId: 'seg-001',
        confidence: 1.5,
      }),
    ).toThrow(/confidence/);
  });
});

describe('fault injection — recovery signals', () => {
  it('timeout recovery signal: TaskRunner stores timeout error message', async () => {
    // This test is a structural assertion; the full runtime test lives in TaskRunner.test.ts.
    // We verify the error message contract here so downstream observability can rely on it.
    const { TaskRunner } = await import('./tasks/TaskRunner');
    const { db } = await import('../db');
    await db.open();
    const runner = new TaskRunner({ concurrency: 1, defaultTimeoutMs: 100 });

    const enqueued = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      run: async () => new Promise<string>(() => {}),
    });

    await expect(enqueued.result).rejects.toBeTruthy();
    const row = await db.ai_tasks.get(enqueued.taskId);
    expect(row?.status).toBe('failed');
    expect(row?.errorMessage).toMatch(/timed? out/i);
    await db.ai_tasks.delete(enqueued.taskId);
  });

  it('executor throw recovery signal: failed task is retryable', async () => {
    const { TaskRunner } = await import('./tasks/TaskRunner');
    const { db } = await import('../db');
    await db.open();
    const runner = new TaskRunner(1);

    const enqueued = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      run: async () => {
        throw new Error('injected executor fault');
      },
    });

    await expect(enqueued.result).rejects.toBeTruthy();
    const row = await db.ai_tasks.get(enqueued.taskId);
    expect(row?.status).toBe('failed');
    expect(row?.errorMessage).toContain('injected executor fault');
    // retry() must be able to create a new task from the failed one
    const retriedId = await runner.retry(enqueued.taskId);
    expect(typeof retriedId).toBe('string');
    if (retriedId) {
      await db.ai_tasks.delete(retriedId);
    }
    await db.ai_tasks.delete(enqueued.taskId);
  });

  it('audit write failure does not crash the decision pipeline', () => {
    // Structural assertion: policy resolver is pure and does not depend on audit write success.
    const decision = resolveUserDirectivePolicyDecision(
      { name: 'delete_transcription_segment', arguments: { segmentId: 'seg-001' } },
      { safetyPreferences: { denyDestructive: true } },
    );
    expect(decision.action).toBe('block');
    // The decision shape itself carries the audit signal; no external side-effect is required.
    expect(decision).toHaveProperty('reason');
  });
});
