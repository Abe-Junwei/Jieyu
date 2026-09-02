import { describe, expect, it } from 'vitest';
import { newAgentRunId } from './agentRunId';

describe('newAgentRunId', () => {
  it('returns a run_ prefixed id unique per call', () => {
    const a = newAgentRunId(1);
    const b = newAgentRunId(1);
    expect(a.startsWith('run_')).toBe(true);
    expect(b.startsWith('run_')).toBe(true);
    expect(a).not.toBe(b);
  });
});
