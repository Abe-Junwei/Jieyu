import { describe, expect, it } from 'vitest';
import { resolveOtelBootstrapConfig } from './otel';

describe('resolveOtelBootstrapConfig', () => {
  it('disables OTel when endpoint is missing or runtime flag is off', () => {
    expect(resolveOtelBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_OTEL: 'false',
      VITE_OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/v1/traces',
    }).enabled).toBe(false);

    expect(resolveOtelBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_OTEL: 'true',
    }).enabled).toBe(false);
  });

  it('resolves endpoint, service and environment with bounded sample rate', () => {
    expect(resolveOtelBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_OTEL: 'true',
      VITE_OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/v1/traces',
      VITE_OTEL_SERVICE_NAME: 'jieyu-web-prod',
      VITE_OTEL_ENVIRONMENT: 'staging',
      VITE_OTEL_TRACES_SAMPLE_RATE: '2.5',
    })).toEqual({
      enabled: true,
      endpoint: 'https://otel.example/v1/traces',
      serviceName: 'jieyu-web-prod',
      environment: 'staging',
      tracesSampleRate: 1,
    });

    expect(resolveOtelBootstrapConfig({
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_OTEL: 'true',
      VITE_OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/v1/traces',
      VITE_OTEL_TRACES_SAMPLE_RATE: '-1',
    })).toEqual({
      enabled: true,
      endpoint: 'https://otel.example/v1/traces',
      serviceName: 'jieyu-web',
      environment: 'production',
      tracesSampleRate: 0,
    });
  });
});
