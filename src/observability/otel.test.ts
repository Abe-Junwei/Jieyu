import { describe, expect, it, vi } from 'vitest';
import { addMetricObserver, type MetricEvent } from './metrics';
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

    let innerBatchProcessor: {
      onEnd: ReturnType<typeof vi.fn>;
      forceFlush: ReturnType<typeof vi.fn>;
      shutdown: ReturnType<typeof vi.fn>;
    } | undefined;

    class MockBatchSpanProcessor {
      onEnd = vi.fn();
      onStart = vi.fn();
      forceFlush = vi.fn(() => Promise.resolve());
      shutdown = vi.fn(() => Promise.resolve());

      constructor(readonly exporter: unknown) {
        innerBatchProcessor = this;
      }
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
    const spanProcessors = capturedProviderConfig?.spanProcessors as Array<{
      onEnd?: (span: { attributes?: Record<string, unknown> }) => void;
    }>;
    expect(Array.isArray(spanProcessors)).toBe(true);
    expect(spanProcessors).toHaveLength(1);
    expect(innerBatchProcessor).toBeDefined();

    const fakeSpan = {
      attributes: {
        apiKey: 'secret-key',
        prompt: 'user raw prompt',
        urlFull: 'https://api.example.com/chat?token=abcd&safe=yes',
      },
    };
    spanProcessors[0]?.onEnd?.(fakeSpan);
    expect(fakeSpan.attributes?.apiKey).toBe('[REDACTED]');
    expect(fakeSpan.attributes?.prompt).toBe('len:15');
    expect(fakeSpan.attributes?.urlFull).toBe('https://api.example.com/chat?token=[REDACTED]&safe=yes');
    expect(innerBatchProcessor?.onEnd).toHaveBeenCalledTimes(1);
    expect(innerBatchProcessor?.onEnd).toHaveBeenCalledWith(fakeSpan);
  });

  it('opens exporter circuit after repeated failures and records metrics', async () => {
    const registerSpy = vi.fn();
    let exporterRef: { export: (spans: unknown[], cb: (result: { code: number }) => void) => void } | undefined;
    const observedMetrics: MetricEvent[] = [];
    const removeObserver = addMetricObserver((event) => observedMetrics.push(event));

    class MockWebTracerProvider {
      constructor(readonly config?: unknown) {}

      register(): void {
        registerSpy();
      }
    }

    class MockBatchSpanProcessor {
      onEnd = vi.fn();
      onStart = vi.fn();
      forceFlush = vi.fn(() => Promise.resolve());
      shutdown = vi.fn(() => Promise.resolve());

      constructor(readonly exporter: unknown) {
        exporterRef = exporter as typeof exporterRef;
      }
    }

    class MockParentBasedSampler {
      constructor(readonly config: { root: unknown }) {}
    }

    class MockTraceIdRatioBasedSampler {
      constructor(readonly ratio: number) {}
    }

    class MockFailingOtlpTraceExporter {
      export(_spans: unknown[], resultCallback: (result: { code: number }) => void): void {
        resultCallback({ code: 1 });
      }

      shutdown(): Promise<void> {
        return Promise.resolve();
      }
    }

    await initOtelWithResolvedConfig(
      {
        enabled: true,
        endpoint: 'https://otel.example/v1/traces',
        serviceName: 'jieyu-web-prod',
        environment: 'staging',
        tracesSampleRate: 0.5,
        circuitBreakerFailureThreshold: 2,
      },
      async () => ({
        sdkWeb: { WebTracerProvider: MockWebTracerProvider },
        sdkBase: {
          BatchSpanProcessor: MockBatchSpanProcessor,
          ParentBasedSampler: MockParentBasedSampler,
          TraceIdRatioBasedSampler: MockTraceIdRatioBasedSampler,
        },
        otlp: { OTLPTraceExporter: MockFailingOtlpTraceExporter },
        resources: {},
        semantics: {},
      }),
    );

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(exporterRef).toBeDefined();

    exporterRef?.export([], () => undefined);
    exporterRef?.export([], () => undefined);
    exporterRef?.export([], () => undefined);

    expect(observedMetrics.some((event) => event.id === 'ai.trace.otel_export_failure_count')).toBe(true);
    expect(observedMetrics.some((event) => event.id === 'ai.trace.otel_circuit_open_count')).toBe(true);
    expect(observedMetrics.some((event) => event.id === 'ai.trace.otel_circuit_short_circuit_count')).toBe(true);
    removeObserver();
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
