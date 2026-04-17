import { describe, expect, it, vi } from 'vitest';
import { initOtelWithResolvedConfig, resolveOtelBootstrapConfig } from './otel';

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
      VITE_OTEL_EXPORT_ENABLED: 'true',
      VITE_OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/v1/traces',
      VITE_OTEL_SERVICE_NAME: 'jieyu-web-prod',
      VITE_OTEL_ENVIRONMENT: 'staging',
      VITE_OTEL_TRACES_SAMPLE_RATE: '2.5',
      VITE_APP_VERSION: '2026.04.17',
      VITE_OTEL_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '5',
    })).toEqual({
      enabled: true,
      endpoint: 'https://otel.example/v1/traces',
      serviceName: 'jieyu-web-prod',
      serviceVersion: '2026.04.17',
      environment: 'staging',
      tracesSampleRate: 1,
      exportTimeoutMillis: 10_000,
      scheduledDelayMillis: 1_000,
      maxQueueSize: 256,
      maxExportBatchSize: 64,
      circuitBreakerFailureThreshold: 5,
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
      serviceVersion: __APP_VERSION__,
      environment: 'production',
      tracesSampleRate: 0,
      exportTimeoutMillis: 10_000,
      scheduledDelayMillis: 1_000,
      maxQueueSize: 256,
      maxExportBatchSize: 64,
      circuitBreakerFailureThreshold: 3,
    });
  });
});

describe('initOtelWithResolvedConfig', () => {
  it('registers tracer provider with constructor spanProcessors', async () => {
    const registerSpy = vi.fn();
    let capturedProviderConfig: Record<string, unknown> | undefined;
    let capturedExporterConfig: Record<string, unknown> | undefined;

    class MockWebTracerProvider {
      constructor(config?: unknown) {
        capturedProviderConfig = config as Record<string, unknown>;
      }

      register(): void {
        registerSpy();
      }
    }

    class MockBatchSpanProcessor {
      constructor(readonly exporter: unknown) {}
    }

    class MockParentBasedSampler {
      constructor(readonly config: { root: unknown }) {}
    }

    class MockTraceIdRatioBasedSampler {
      constructor(readonly ratio: number) {}
    }

    class MockOtlpTraceExporter {
      constructor(config?: unknown) {
        capturedExporterConfig = config as Record<string, unknown>;
      }
    }

    await initOtelWithResolvedConfig(
      {
        enabled: true,
        endpoint: 'https://otel.example/v1/traces',
        serviceName: 'jieyu-web-prod',
        environment: 'staging',
        tracesSampleRate: 0.5,
      },
      async () => ({
        sdkWeb: { WebTracerProvider: MockWebTracerProvider },
        sdkBase: {
          BatchSpanProcessor: MockBatchSpanProcessor,
          ParentBasedSampler: MockParentBasedSampler,
          TraceIdRatioBasedSampler: MockTraceIdRatioBasedSampler,
        },
        otlp: { OTLPTraceExporter: MockOtlpTraceExporter },
        resources: {
          resourceFromAttributes: (attributes: Record<string, unknown>) => ({
            attrs: attributes,
          }),
        },
        semantics: {
          ATTR_SERVICE_NAME: 'service.name',
          ATTR_DEPLOYMENT_ENVIRONMENT_NAME: 'deployment.environment.name',
        },
      }),
    );

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(capturedExporterConfig).toEqual({
      url: 'https://otel.example/v1/traces',
      timeoutMillis: 10_000,
    });

    expect(capturedProviderConfig).toBeDefined();
    expect(capturedProviderConfig?.resource).toEqual({
      attrs: {
        'service.name': 'jieyu-web-prod',
        'deployment.environment.name': 'staging',
        'service.version': __APP_VERSION__,
      },
    });
    const spanProcessors = capturedProviderConfig?.spanProcessors as Array<{ onEnd?: (span: { attributes?: Record<string, unknown> }) => void }>;
    expect(Array.isArray(spanProcessors)).toBe(true);
    expect(spanProcessors).toHaveLength(2);
    expect(spanProcessors[1]).toBeInstanceOf(MockBatchSpanProcessor);

    const fakeSpan = {
      attributes: {
        apiKey: 'secret-key',
        prompt: 'user raw prompt',
        urlFull: 'https://api.example.com/chat?token=abcd&safe=yes',
      },
    };
    spanProcessors[0]?.onEnd?.(fakeSpan);
    expect(fakeSpan.attributes.apiKey).toBe('[REDACTED]');
    expect(fakeSpan.attributes.prompt).toBe('len:15');
    expect(fakeSpan.attributes.urlFull).toBe('https://api.example.com/chat?token=[REDACTED]&safe=yes');
  });

  it('warns and skips when required SDK exports are missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await initOtelWithResolvedConfig(
      {
        enabled: true,
        endpoint: 'https://otel.example/v1/traces',
        serviceName: 'jieyu-web-prod',
        environment: 'staging',
        tracesSampleRate: 0.5,
      },
      async () => ({
        sdkWeb: {},
        sdkBase: {},
        otlp: {},
        resources: {},
        semantics: {},
      }),
    );

    expect(warnSpy).toHaveBeenCalledWith('[Jieyu] OTel bootstrap skipped: required SDK exports are unavailable.');
    warnSpy.mockRestore();
  });
});
