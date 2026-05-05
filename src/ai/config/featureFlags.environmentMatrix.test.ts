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

  it('respects explicit env overrides over matrix defaults', async () => {
    const flags = await loadFeatureFlagsWithEnv({
      MODE: 'production',
      VITE_M5_OBSERVABILITY_ENV: 'staging',
      VITE_AI_BACKGROUND_TOOL_SANDBOX_ENABLED: 'false',
      VITE_AI_BACKGROUND_MEMORY_SESSION_WRITE_QUOTA_ENABLED: '0',
      VITE_AI_TOOL_CALL_EXECUTOR_AUTO_RETRY_ENABLED: 'false',
    });

    expect(flags.aiBackgroundToolSandboxEnabled).toBe(false);
    expect(flags.aiBackgroundMemorySessionWriteQuotaEnabled).toBe(false);
    expect(flags.aiToolCallExecutorAutoRetryEnabled).toBe(false);
  });
});
