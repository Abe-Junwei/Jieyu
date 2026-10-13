// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const LS = 'jieyu.aiAgentRuntimeV2Enabled';

describe('resolveAiAgentRuntimeV2Enabled localStorage override (R2)', () => {
  afterEach(() => {
    localStorage.removeItem(LS);
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('reads jieyu.aiAgentRuntimeV2Enabled=1 when env flag is off', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_AI_AGENT_RUNTIME_V2_ENABLED', '');
    localStorage.setItem(LS, '1');
    const { featureFlags, resolveAiAgentRuntimeV2Enabled } = await import('./featureFlags');
    expect(resolveAiAgentRuntimeV2Enabled()).toBe(true);
    // env-backed flag stays false; callers OR with resolveAiAgentRuntimeV2Enabled()
    expect(featureFlags.aiAgentRuntimeV2Enabled).toBe(false);
  });
});
