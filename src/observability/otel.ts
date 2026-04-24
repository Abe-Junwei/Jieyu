import { createMetricTags, recordMetric } from './metrics';

export interface OtelBootstrapEnv {
  PROD: boolean;
  MODE: string;
  VITE_ENABLE_OTEL?: string;
  VITE_OTEL_EXPORT_ENABLED?: string;
  VITE_OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  VITE_OTEL_SERVICE_NAME?: string;
  VITE_OTEL_TRACES_SAMPLE_RATE?: string;
  VITE_OTEL_ENVIRONMENT?: string;
  VITE_APP_VERSION?: string;
  VITE_OTEL_EXPORT_TIMEOUT_MS?: string;
  VITE_OTEL_BSP_MAX_QUEUE_SIZE?: string;
  VITE_OTEL_BSP_MAX_EXPORT_BATCH_SIZE?: string;
  VITE_OTEL_BSP_SCHEDULE_DELAY_MS?: string;
  VITE_OTEL_CIRCUIT_BREAKER_FAILURE_THRESHOLD?: string;
}

export interface ResolvedOtelBootstrapConfig {
  enabled: boolean;
  endpoint?: string;
  serviceName: string;
  serviceVersion?: string;
  environment: string;
  tracesSampleRate: number;
  exportTimeoutMillis?: number;
  maxQueueSize?: number;
  maxExportBatchSize?: number;
  scheduledDelayMillis?: number;
  circuitBreakerFailureThreshold?: number;
}

const OTEL_DEFAULT_SERVICE_NAME = 'jieyu-web';
const OTEL_DEFAULT_SERVICE_VERSION = '0.0.0-dev';
const OTEL_DEFAULT_EXPORT_TIMEOUT_MILLIS = 10_000;
const OTEL_DEFAULT_MAX_QUEUE_SIZE = 256;
const OTEL_DEFAULT_MAX_EXPORT_BATCH_SIZE = 64;
const OTEL_DEFAULT_SCHEDULE_DELAY_MILLIS = 1_000;
const OTEL_DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const OTEL_EXPORT_RESULT_SUCCESS = 0;
const OTEL_SENSITIVE_KEY_RE = /api.?key|token|password|secret|authorization/i;
const OTEL_CONTENT_KEY_RE = /prompt|input|content/i;
const OTEL_URL_SECRET_RE = /([?&](?:api.?key|token|password|secret|authorization)=)[^&]*/gi;
let otelInitPromise: Promise<void> | null = null;
let otelConsecutiveExportFailures = 0;
let otelExportCircuitOpen = false;
let otelCircuitResetTimer: ReturnType<typeof setTimeout> | null = null;
const OTEL_CIRCUIT_RESET_COOLDOWN_MS = 30_000;

function scheduleOtelCircuitHalfOpenProbe(): void {
  if (otelCircuitResetTimer !== null) {
    clearTimeout(otelCircuitResetTimer);
    otelCircuitResetTimer = null;
  }
  otelCircuitResetTimer = setTimeout(() => {
    otelCircuitResetTimer = null;
    if (otelExportCircuitOpen) {
      otelExportCircuitOpen = false;
      otelConsecutiveExportFailures = 0;
      console.info('[Jieyu] OTel exporter circuit: cooldown elapsed; re-enabling trace export attempts.');
    }
  }, OTEL_CIRCUIT_RESET_COOLDOWN_MS);
}

type OtelRuntimeModules = {
  sdkWeb: Record<string, unknown>;
  sdkBase: Record<string, unknown>;
  otlp: Record<string, unknown>;
  resources: Record<string, unknown>;
  semantics: Record<string, unknown>;
};

type OtelRuntimeModuleLoader = () => Promise<OtelRuntimeModules>;

type OtelExportResult = {
  code: number;
  error?: Error;
};

type OtelSpanExporterLike = {
  export: (spans: unknown[], resultCallback: (result: OtelExportResult) => void) => void;
  shutdown: () => Promise<void>;
  forceFlush?: () => Promise<void>;
};

function normalizeSampleRate(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? '0');
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

function normalizePositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function safeRecordOtelMetric(id: string, value: number, tags?: Record<string, string | number | boolean>): void {
  try {
    recordMetric({
      id,
      value,
      tags: createMetricTags('otel-bootstrap', tags),
    });
  } catch {
    // noop - 遥测失败不影响主流程 | Metric failures must not break app flow
  }
}

function createCircuitBreakerSpanExporter(
  exporter: OtelSpanExporterLike,
  failureThreshold: number,
): OtelSpanExporterLike {
  return {
    export(spans, resultCallback) {
      if (otelExportCircuitOpen) {
        safeRecordOtelMetric('ai.trace.otel_circuit_short_circuit_count', 1);
        resultCallback({ code: OTEL_EXPORT_RESULT_SUCCESS });
        return;
      }

      exporter.export(spans, (result) => {
        if (result.code === OTEL_EXPORT_RESULT_SUCCESS) {
          otelConsecutiveExportFailures = 0;
          resultCallback(result);
          return;
        }

        otelConsecutiveExportFailures += 1;
        safeRecordOtelMetric('ai.trace.otel_export_failure_count', 1, {
          consecutive_failures: otelConsecutiveExportFailures,
        });

        if (!otelExportCircuitOpen && otelConsecutiveExportFailures >= failureThreshold) {
          otelExportCircuitOpen = true;
          safeRecordOtelMetric('ai.trace.otel_circuit_open_count', 1, {
            threshold: failureThreshold,
          });
          console.warn('[Jieyu] OTel exporter circuit opened after consecutive export failures.');
          scheduleOtelCircuitHalfOpenProbe();
        }

        resultCallback(result);
      });
    },
    async shutdown() {
      await exporter.shutdown();
    },
    async forceFlush() {
      await exporter.forceFlush?.();
    },
  };
}

function resolveServiceVersion(rawValue: string | undefined): string {
  const trimmed = rawValue?.trim();
  if (trimmed) return trimmed;
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim()) {
    return __APP_VERSION__.trim();
  }
  return OTEL_DEFAULT_SERVICE_VERSION;
}

function scrubOtelAttributeValue(key: string, value: unknown): unknown {
  if (value == null) return value;

  if (OTEL_SENSITIVE_KEY_RE.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    if (OTEL_CONTENT_KEY_RE.test(key) && value.length > 0) {
      return `len:${value.length}`;
    }
    if (/url/i.test(key)) {
      return value.replace(OTEL_URL_SECRET_RE, '$1[REDACTED]');
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubOtelAttributeValue(key, item));
  }

  return value;
}

export function scrubOtelSpanAttributes(attributes: Record<string, unknown> | undefined): void {
  if (!attributes) return;
  for (const [key, value] of Object.entries(attributes)) {
    attributes[key] = scrubOtelAttributeValue(key, value);
  }
}

/** 与 BatchSpanProcessor 相同的生命周期，在 onEnd 时脱敏后再交给下游 | Scrub attributes then forward to delegate (e.g. BatchSpanProcessor) */
type SpanProcessorDelegate = {
  onStart: (span: unknown, parentContext: unknown) => void;
  onEnd: (span: { attributes?: Record<string, unknown> }) => void;
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
  onEnding?: (span: unknown) => void;
};

function createScrubbingBatchSpanProcessor(delegate: SpanProcessorDelegate): SpanProcessorDelegate {
  return {
    onStart(span, parentContext) {
      delegate.onStart(span, parentContext);
    },
    onEnding(span) {
      delegate.onEnding?.(span);
    },
    onEnd(span) {
      const attrs = span.attributes;
      if (attrs && typeof attrs === 'object') {
        scrubOtelSpanAttributes(attrs as Record<string, unknown>);
      }
      delegate.onEnd(span);
    },
    forceFlush: () => delegate.forceFlush(),
    shutdown: () => delegate.shutdown(),
  };
}

export function resolveOtelBootstrapConfig(env: OtelBootstrapEnv): ResolvedOtelBootstrapConfig {
  const endpoint = env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const serviceName = env.VITE_OTEL_SERVICE_NAME?.trim() || OTEL_DEFAULT_SERVICE_NAME;
  const environment = env.VITE_OTEL_ENVIRONMENT?.trim() || env.MODE;
  const exportEnabledFlag = (env.VITE_OTEL_EXPORT_ENABLED ?? env.VITE_ENABLE_OTEL)?.trim().toLowerCase() === 'true';
  const enabled = env.PROD && exportEnabledFlag && Boolean(endpoint);

  return {
    enabled,
    ...(endpoint ? { endpoint } : {}),
    serviceName,
    serviceVersion: resolveServiceVersion(env.VITE_APP_VERSION),
    environment,
    tracesSampleRate: normalizeSampleRate(env.VITE_OTEL_TRACES_SAMPLE_RATE),
    exportTimeoutMillis: normalizePositiveInteger(env.VITE_OTEL_EXPORT_TIMEOUT_MS, OTEL_DEFAULT_EXPORT_TIMEOUT_MILLIS),
    scheduledDelayMillis: normalizePositiveInteger(env.VITE_OTEL_BSP_SCHEDULE_DELAY_MS, OTEL_DEFAULT_SCHEDULE_DELAY_MILLIS),
    maxQueueSize: normalizePositiveInteger(env.VITE_OTEL_BSP_MAX_QUEUE_SIZE, OTEL_DEFAULT_MAX_QUEUE_SIZE),
    maxExportBatchSize: normalizePositiveInteger(env.VITE_OTEL_BSP_MAX_EXPORT_BATCH_SIZE, OTEL_DEFAULT_MAX_EXPORT_BATCH_SIZE),
    circuitBreakerFailureThreshold: normalizePositiveInteger(
      env.VITE_OTEL_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      OTEL_DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    ),
  };
}

async function loadOtelRuntimeModules(): Promise<OtelRuntimeModules> {
  const [sdkWebModule, sdkBaseModule, exporterModule, resourcesModule, semanticModule] = await Promise.all([
    import('@opentelemetry/sdk-trace-web'),
    import('@opentelemetry/sdk-trace-base'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
  ]);

  return {
    sdkWeb: sdkWebModule as Record<string, unknown>,
    sdkBase: sdkBaseModule as Record<string, unknown>,
    otlp: exporterModule as Record<string, unknown>,
    resources: resourcesModule as Record<string, unknown>,
    semantics: semanticModule as Record<string, unknown>,
  };
}

export async function initOtelWithResolvedConfig(
  config: ResolvedOtelBootstrapConfig,
  moduleLoader: OtelRuntimeModuleLoader = loadOtelRuntimeModules,
): Promise<void> {
  if (!config.enabled || !config.endpoint) {
    return;
  }

  try {
    const { sdkWeb, sdkBase, otlp, resources, semantics } = await moduleLoader();
    const exportTimeoutMillis = config.exportTimeoutMillis ?? OTEL_DEFAULT_EXPORT_TIMEOUT_MILLIS;
    const scheduledDelayMillis = config.scheduledDelayMillis ?? OTEL_DEFAULT_SCHEDULE_DELAY_MILLIS;
    const maxQueueSize = config.maxQueueSize ?? OTEL_DEFAULT_MAX_QUEUE_SIZE;
    const maxExportBatchSize = config.maxExportBatchSize ?? OTEL_DEFAULT_MAX_EXPORT_BATCH_SIZE;
    const circuitBreakerFailureThreshold = config.circuitBreakerFailureThreshold
      ?? OTEL_DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    const serviceVersion = config.serviceVersion || resolveServiceVersion(undefined);

    const WebTracerProvider = sdkWeb.WebTracerProvider as (new (config?: unknown) => unknown) | undefined;
    const BatchSpanProcessor = sdkBase.BatchSpanProcessor as (new (exporter: unknown, config?: unknown) => unknown) | undefined;
    const ParentBasedSampler = sdkBase.ParentBasedSampler as (new (config: { root: unknown }) => unknown) | undefined;
    const TraceIdRatioBasedSampler = sdkBase.TraceIdRatioBasedSampler as (new (ratio: number) => unknown) | undefined;
    const OTLPTraceExporter = otlp.OTLPTraceExporter as (new (config?: unknown) => unknown) | undefined;
    const resourceFromAttributes = resources.resourceFromAttributes as ((attributes: Record<string, unknown>) => unknown) | undefined;

    if (!WebTracerProvider || !BatchSpanProcessor || !OTLPTraceExporter || !ParentBasedSampler || !TraceIdRatioBasedSampler) {
      safeRecordOtelMetric('ai.trace.otel_bootstrap_failure_count', 1, {
        reason: 'missing_runtime_exports',
      });
      console.warn('[Jieyu] OTel bootstrap skipped: required SDK exports are unavailable.');
      return;
    }

    const serviceNameAttr = typeof semantics.ATTR_SERVICE_NAME === 'string'
      ? semantics.ATTR_SERVICE_NAME
      : 'service.name';
    const deploymentEnvAttr = typeof semantics.ATTR_DEPLOYMENT_ENVIRONMENT_NAME === 'string'
      ? semantics.ATTR_DEPLOYMENT_ENVIRONMENT_NAME
      : 'deployment.environment.name';
    const serviceVersionAttr = typeof semantics.ATTR_SERVICE_VERSION === 'string'
      ? semantics.ATTR_SERVICE_VERSION
      : 'service.version';

    const resource = resourceFromAttributes
      ? resourceFromAttributes({
          [serviceNameAttr]: config.serviceName,
          [deploymentEnvAttr]: config.environment,
          [serviceVersionAttr]: serviceVersion,
        })
      : undefined;

    const exporter = new OTLPTraceExporter({
      url: config.endpoint,
      timeoutMillis: exportTimeoutMillis,
    }) as OtelSpanExporterLike;
    const exporterWithCircuitBreaker = createCircuitBreakerSpanExporter(exporter, circuitBreakerFailureThreshold);
    const spanProcessor = new BatchSpanProcessor(exporterWithCircuitBreaker, {
      maxQueueSize,
      maxExportBatchSize: Math.min(maxExportBatchSize, maxQueueSize),
      scheduledDelayMillis,
      exportTimeoutMillis,
    }) as SpanProcessorDelegate;

    const providerConfig = {
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(config.tracesSampleRate),
      }),
      spanProcessors: [createScrubbingBatchSpanProcessor(spanProcessor)],
      ...(resource ? { resource } : {}),
    };

    const provider = new WebTracerProvider(providerConfig) as {
      register?: () => void;
    };

    if (typeof provider.register === 'function') {
      provider.register();
      return;
    }

    safeRecordOtelMetric('ai.trace.otel_bootstrap_failure_count', 1, {
      reason: 'register_unavailable',
    });
    console.warn('[Jieyu] OTel bootstrap skipped: tracer provider register() is unavailable.');
  } catch (error) {
    // OTel 初始化失败不应阻塞应用启动 | OTel initialization failure must not block app startup
    safeRecordOtelMetric('ai.trace.otel_bootstrap_failure_count', 1, {
      reason: 'init_exception',
    });
    console.warn('[Jieyu] OTel bootstrap failed; tracing disabled for this session.', error);
  }
}

async function initOtelForReleaseStageOnce(): Promise<void> {
  const config = resolveOtelBootstrapConfig(import.meta.env);
  await initOtelWithResolvedConfig(config);
}

export function initOtelForReleaseStage(): Promise<void> {
  if (!otelInitPromise) {
    otelInitPromise = initOtelForReleaseStageOnce();
  }
  return otelInitPromise;
}
