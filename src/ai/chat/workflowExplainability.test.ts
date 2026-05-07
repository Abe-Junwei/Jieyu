import { describe, expect, it } from 'vitest';
import {
  buildWorkflowExplainabilityFromAssistantMessage,
  collectWorkflowExplainabilitySnapshots,
  mergeContextSnapshotWithWorkflowExplainability,
  parseWorkflowExplainabilityFromContextSnapshot,
} from './workflowExplainability';

describe('buildWorkflowExplainabilityFromAssistantMessage', () => {
  it('marks assistant_error when status is error', () => {
    const dto = buildWorkflowExplainabilityFromAssistantMessage({
      status: 'error',
      error: 'boom',
    });
    expect(dto.headlineKey).toBe('assistant_error');
    expect(dto.tone).toBe('warning');
    expect(dto.hasDegradation).toBe(false);
  });

  it('marks degraded_response when degradation scenarios exist', () => {
    const dto = buildWorkflowExplainabilityFromAssistantMessage({
      status: 'done',
      degradationScenarios: ['reflection_flagged'],
    });
    expect(dto.headlineKey).toBe('degraded_response');
    expect(dto.tone).toBe('info');
    expect(dto.hasDegradation).toBe(true);
    expect(dto.detailSignals).toContain('degradation:reflection_flagged');
  });

  it('includes source scope signals when summary present', () => {
    const dto = buildWorkflowExplainabilityFromAssistantMessage({
      status: 'done',
      sourceScopeSummary: {
        evidenceCount: 2,
        sourceTypeBreakdown: { unit: 2 },
        scopeLabel: 'units',
      },
    });
    expect(dto.headlineKey).toBe('scope_summary_only');
    expect(dto.hasSourceScopeSummary).toBe(true);
    expect(dto.detailSignals.some((s) => s.startsWith('source_scope:'))).toBe(true);
  });

  it('collectWorkflowExplainabilitySnapshots keeps assistant rows only', () => {
    const a = buildWorkflowExplainabilityFromAssistantMessage({
      status: 'done',
      degradationScenarios: ['rag_no_results'],
    });
    const snaps = collectWorkflowExplainabilitySnapshots([
      { role: 'user' },
      { role: 'assistant', workflowExplainability: a },
    ]);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.headlineKey).toBe('degraded_response');
  });

  it('round-trips explainability via contextSnapshot merge + parse', () => {
    const dto = buildWorkflowExplainabilityFromAssistantMessage({
      status: 'done',
      sourceScopeSummary: {
        evidenceCount: 1,
        sourceTypeBreakdown: { unit: 1 },
        scopeLabel: 'segment',
      },
    });
    const merged = mergeContextSnapshotWithWorkflowExplainability({ other: 1 }, dto);
    expect(parseWorkflowExplainabilityFromContextSnapshot(merged)).toEqual(dto);
  });
});
