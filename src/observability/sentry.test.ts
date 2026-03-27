import { describe, expect, it } from 'vitest';
import { resolveSentryBootstrapConfig } from './sentry';

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
    })).toEqual({
      enabled: true,
      dsn: 'https://example.com/1',
      environment: 'staging',
      tracesSampleRate: 1,
      release: 'jieyu@2026.03.28',
      sendDefaultPii: true,
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
    });
  });
});