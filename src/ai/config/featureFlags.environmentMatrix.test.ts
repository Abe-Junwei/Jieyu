import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFeatureFlagsWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      vi.stubEnv(key, '');
    } else {
      vi.stubEnv(key, value);
    }
  }

  const mod = await import('./featureFlags');
  return mod.featureFlags;
}

describe('featureFlags environment matrix', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('enables sandbox/quota/auto-retry by default in dogfood and staging', async () => {
    const dogfood = await loadFeatureFlagsWithEnv({
      MODE: 'production',
      VITE_M5_OBSERVABILITY_ENV: 'dogfood',
      VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED: undefined,
      VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED: undefined,
      VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED: undefined,
    });

    expect(dogfood.aiBackgroundToolSandboxEnabled).toBe(true);
    expect(dogfood.aiBackgroundMemorySessionWriteQuotaEnabled).toBe(true);
    expect(dogfood.aiToolCallExecutorAutoRetryEnabled).toBe(true);

    const staging = await loadFeatureFlagsWithEnv({
      MODE: 'production',
      VITE_M5_OBSERVABILITY_ENV: 'staging',
      VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED: undefined,
      VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED: undefined,
      VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED: undefined,
    });

    expect(staging.aiBackgroundToolSandboxEnabled).toBe(true);
    expect(staging.aiBackgroundMemorySessionWriteQuotaEnabled).toBe(true);
    expect(staging.aiToolCallExecutorAutoRetryEnabled).toBe(true);
  });

  it('keeps sandbox/quota/auto-retry disabled by default in prod and local', async () => {
    const prod = await loadFeatureFlagsWithEnv({
      MODE: 'production',
      VITE_M5_OBSERVABILITY_ENV: 'production',
      VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED: undefined,
      VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED: undefined,
      VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED: undefined,
    });

    expect(prod.aiBackgroundToolSandboxEnabled).toBe(false);
    expect(prod.aiBackgroundMemorySessionWriteQuotaEnabled).toBe(false);
    expect(prod.aiToolCallExecutorAutoRetryEnabled).toBe(false);

    const local = await loadFeatureFlagsWithEnv({
      MODE: 'development',
      VITE_M5_OBSERVABILITY_ENV: undefined,
      VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED: undefined,
      VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED: undefined,
      VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED: undefined,
    });

    expect(local.aiBackgroundToolSandboxEnabled).toBe(false);
    expect(local.aiBackgroundMemorySessionWriteQuotaEnabled).toBe(false);
    expect(local.aiToolCallExecutorAutoRetryEnabled).toBe(false);
  });

  it('enables agent-loop reliability flags by default in dogfood and staging', async () => {
    const dogfood = await loadFeatureFlagsWithEnv({
      MODE: 'production',
      VITE_M5_OBSERVABILITY_ENV: 'dogfood',
      VITE_AI_AGENT_LOOP_CLOSED_LOOP_REPLANNING_ENABLED: undefined,
      VITE_AI_AGENT_LOOP_TOOL_RESULT_QUALITY_GATE_ENABLED: undefined,
      VITE_AI_AGENT_LOOP_CONTEXT_BUDGET_RECALCULATION_ENABLED: undefined,
      VITE_AI_TOOL_WRITE_GATE_ENABLED: undefined,
      VITE_AI_AGENT_LOOP_TOOL_RESULT_COMPACTION_ENABLED: undefined,
    });

    expect(dogfood.aiAgentLoopClosedLoopReplanningEnabled).toBe(true);
    expect(dogfood.aiAgentLoopToolResultQualityGateEnabled).toBe(true);
    expect(dogfood.aiAgentLoopContextBudgetRecalculationEnabled).toBe(true);
    expect(dogfood.aiToolWriteGateEnabled).toBe(true);
    expect(dogfood.aiAgentLoopToolResultCompactionEnabled).toBe(true);

    const prod = await loadFeatureFlagsWithEnv({
      MODE: 'production',
      VITE_M5_OBSERVABILITY_ENV: 'production',
      VITE_AI_AGENT_LOOP_CLOSED_LOOP_REPLANNING_ENABLED: undefined,
      VITE_AI_AGENT_LOOP_TOOL_RESULT_QUALITY_GATE_ENABLED: undefined,
      VITE_AI_AGENT_LOOP_CONTEXT_BUDGET_RECALCULATION_ENABLED: undefined,
      VITE_AI_TOOL_WRITE_GATE_ENABLED: undefined,
      VITE_AI_AGENT_LOOP_TOOL_RESULT_COMPACTION_ENABLED: undefined,
    });

    expect(prod.aiAgentLoopClosedLoopReplanningEnabled).toBe(true);
    expect(prod.aiAgentLoopToolResultQualityGateEnabled).toBe(true);
    expect(prod.aiAgentLoopContextBudgetRecalculationEnabled).toBe(true);
    expect(prod.aiToolWriteGateEnabled).toBe(false);
    expect(prod.aiAgentLoopToolResultCompactionEnabled).toBe(true);
    expect(prod.aiAgentLoopEffortScalingEnabled).toBe(false);
    expect(dogfood.aiAgentLoopEffortScalingEnabled).toBe(false);
    expect(prod.aiAgentUiPreviewEnabled).toBe(false);
    expect(dogfood.aiAgentUiPreviewEnabled).toBe(false);
    expect(prod.aiSemanticGuardEnabled).toBe(false);
    expect(dogfood.aiSemanticGuardEnabled).toBe(false);
    expect(prod.aiExternalMcpTrustEnabled).toBe(false);
    expect(dogfood.aiExternalMcpTrustEnabled).toBe(false);
    expect(prod.aiMcpResourcesArtifactsEnabled).toBe(false);
    expect(dogfood.aiMcpResourcesArtifactsEnabled).toBe(false);
    expect(prod.aiExternalMcpHttpClientEnabled).toBe(false);
    expect(dogfood.aiExternalMcpHttpClientEnabled).toBe(false);
    expect(prod.aiExternalMcpSendTurnEnabled).toBe(false);
    expect(dogfood.aiExternalMcpSendTurnEnabled).toBe(false);
  });

  it('respects explicit env overrides over matrix defaults', async () => {
    const flags = await loadFeatureFlagsWithEnv({
      MODE: 'production',
      VITE_M5_OBSERVABILITY_ENV: 'staging',
      VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED: 'false',
      VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED: '0',
      VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED: 'false',
      VITE_AI_AGENT_LOOP_EFFORT_SCALING_ENABLED: 'true',
      VITE_AI_AGENT_UI_PREVIEW_ENABLED: 'true',
      VITE_AI_SEMANTIC_GUARD_ENABLED: 'true',
      VITE_AI_EXTERNAL_MCP_TRUST_ENABLED: 'true',
      VITE_AI_MCP_RESOURCES_ARTIFACTS_ENABLED: 'true',
      VITE_AI_EXTERNAL_MCP_HTTP_CLIENT_ENABLED: 'true',
      VITE_AI_EXTERNAL_MCP_SEND_TURN_ENABLED: 'true',
    });

    expect(flags.aiBackgroundToolSandboxEnabled).toBe(false);
    expect(flags.aiBackgroundMemorySessionWriteQuotaEnabled).toBe(false);
    expect(flags.aiToolCallExecutorAutoRetryEnabled).toBe(false);
    expect(flags.aiAgentLoopEffortScalingEnabled).toBe(true);
    expect(flags.aiAgentUiPreviewEnabled).toBe(true);
    expect(flags.aiSemanticGuardEnabled).toBe(true);
    expect(flags.aiExternalMcpTrustEnabled).toBe(true);
    expect(flags.aiMcpResourcesArtifactsEnabled).toBe(true);
    expect(flags.aiExternalMcpHttpClientEnabled).toBe(true);
    expect(flags.aiExternalMcpSendTurnEnabled).toBe(true);
  });
});
