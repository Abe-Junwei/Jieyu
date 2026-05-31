import { describe, expect, it } from 'vitest';
import { buildAgentLoopContinuationToolPayload } from './agentLoopPayload';
import type { LocalContextToolResult } from '../localContextToolTypes';

// 不 mock featureFlags → verify 步 flag 取真源默认（false）。
// 锁定"关闭时 continuation 输出不含 quality 字段"的逐字节兼容保证。
describe('buildAgentLoopContinuationToolPayload — verify 步 (flag OFF, default)', () => {
  it('never attaches a quality field even when results are empty/failed', () => {
    const results: LocalContextToolResult[] = [
      { ok: true, name: 'search_units', result: { count: 0, matches: [] } },
      { ok: false, name: 'get_unit_detail', result: null, error: 'unit not found' },
    ];
    const { payloadJson } = buildAgentLoopContinuationToolPayload('q', results, 1);
    const parsed = JSON.parse(payloadJson);
    expect(parsed).not.toHaveProperty('quality');
    expect(parsed).toMatchObject({ type: 'local_tool_result', step: 1 });
  });
});
