import { describe, expect, it, vi } from 'vitest';
import type { LocalContextToolResult } from '../localContextToolTypes';

// 切换 verify 步 flag = ON；其余 flag 保持真源默认。
vi.mock('../../config/featureFlags', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../config/featureFlags')>();
  return {
    ...mod,
    featureFlags: {
      ...mod.featureFlags,
      aiAgentLoopToolResultQualityGateEnabled: true,
    },
  };
});

const RESULTS: LocalContextToolResult[] = [
  { ok: true, name: 'search_units', result: { count: 0, matches: [] } },
  { ok: true, name: 'get_project_stats', result: { value: 7 } },
];

describe('buildAgentLoopContinuationToolPayload — verify 步 (flag ON)', () => {
  it('attaches a quality field carrying only annotated entries', async () => {
    const { buildAgentLoopContinuationToolPayload } = await import('./agentLoopPayload');
    const { payloadJson } = buildAgentLoopContinuationToolPayload('原始问题', RESULTS, 1);
    const parsed = JSON.parse(payloadJson) as {
      quality?: Array<{ name: string; annotations: string[] }>;
      results: unknown[];
    };
    expect(parsed.quality).toEqual([
      { name: 'search_units', ok: true, annotations: ['search_no_results'] },
    ]);
    // 原始 results 不被质量层改写
    expect(parsed.results).toHaveLength(2);
  });

  it('omits the quality field entirely when all results are healthy', async () => {
    const { buildAgentLoopContinuationToolPayload } = await import('./agentLoopPayload');
    const healthy: LocalContextToolResult[] = [
      { ok: true, name: 'list_units', result: [{ id: 'u1' }] },
    ];
    const { payloadJson } = buildAgentLoopContinuationToolPayload('q', healthy, 1);
    expect(JSON.parse(payloadJson)).not.toHaveProperty('quality');
  });
});
