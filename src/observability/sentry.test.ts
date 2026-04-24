import { describe, expect, it, vi } from 'vitest';
import { initSentryWithResolvedConfig, resolveSentryBootstrapConfig } from './sentry';

describe('resolveSentryBootstrapConfig', () => {
  it('disables Sentry when DSN is missing or runtime flag is off', () => {
    expect(resolveSentryBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_SENTRY: 'false',
    }).enabled).toBe(false);

    expect(resolveSentryBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_SENTRY: 'true',
    }).enabled).toBe(false);
  });

  it('resolves release, environment and PII flags with safe defaults', () => {
    expect(resolveSentryBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_SENTRY: 'true',
      VITE_SENTRY_DSN: 'https://example.com/1',
      VITE_SENTRY_TRACES_SAMPLE_RATE: '2.5',
      VITE_SENTRY_RELEASE: 'jieyu@2026.03.28',
      VITE_SENTRY_ENVIRONMENT: 'staging',
      VITE_SENTRY_SEND_DEFAULT_PII: 'true',
      VITE_SENTRY_ENABLE_BROWSER_TRACING: 'false',
    })).toEqual({
      enabled: true,
      dsn: 'https://example.com/1',
      environment: 'staging',
      tracesSampleRate: 1,
      release: 'jieyu@2026.03.28',
      sendDefaultPii: true,
      enableBrowserTracing: false,
    });

    expect(resolveSentryBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_SENTRY: 'true',
      VITE_SENTRY_DSN: 'https://example.com/1',
      VITE_SENTRY_TRACES_SAMPLE_RATE: '-1',
    })).toEqual({
      enabled: true,
      dsn: 'https://example.com/1',
      environment: 'production',
      tracesSampleRate: 0,
      sendDefaultPii: false,
      enableBrowserTracing: true,
    });
  });

  it('uses VITE_APP_VERSION as release when VITE_SENTRY_RELEASE is unset', () => {
    expect(resolveSentryBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_SENTRY: 'true',
      VITE_SENTRY_DSN: 'https://example.com/1',
      VITE_APP_VERSION: '1.0.0',
    }).release).toBe('1.0.0');
  });

  it('prefers VITE_SENTRY_RELEASE over VITE_APP_VERSION', () => {
    expect(resolveSentryBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_SENTRY: 'true',
      VITE_SENTRY_DSN: 'https://example.com/1',
      VITE_SENTRY_RELEASE: 'deploy-42',
      VITE_APP_VERSION: '1.0.0',
    }).release).toBe('deploy-42');
  });

  it('does not throw when runtime loader fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(initSentryWithResolvedConfig(
      {
        enabled: true,
        dsn: 'https://example.com/1',
        environment: 'production',
        tracesSampleRate: 1,
        sendDefaultPii: false,
        enableBrowserTracing: true,
      },
      async () => {
        throw new Error('dynamic import failed');
      },
    )).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      '[Jieyu] Sentry bootstrap failed; error reporting disabled for this session.',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});