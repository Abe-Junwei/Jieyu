export interface OtelBootstrapEnv {
  PROD: boolean;
  MODE: string;
  VITE_ENABLE_OTEL?: string;
  VITE_OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  VITE_OTEL_SERVICE_NAME?: string;
  VITE_OTEL_TRACES_SAMPLE_RATE?: string;
  VITE_OTEL_ENVIRONMENT?: string;
}

export interface ResolvedOtelBootstrapConfig {
  enabled: boolean;
  endpoint?: string;
  serviceName: string;
  environment: string;
  tracesSampleRate: number;
}

const OTEL_DEFAULT_SERVICE_NAME = 'jieyu-web';
let otelInitPromise: Promise<void> | null = null;

/**
 * OTel 依赖按运行时可选加载，避免本地开发或未装 tracing 包时被 Vite 预解析直接打断。
 * Load OTel packages as optional runtime modules so Vite import analysis doesn't hard-fail local dev.
 */
const OTEL_MODULE_IDS = {
  sdkTraceWeb: '@opentelemetry/sdk-trace-web',
  sdkTraceBase: '@opentelemetry/sdk-trace-base',
  exporterTraceOtlpHttp: '@opentelemetry/exporter-trace-otlp-http',
  resources: '@opentelemetry/resources',
  semanticConventions: '@opentelemetry/semantic-conventions',
} as const;

function normalizeSampleRate(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? '0');
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

export function resolveOtelBootstrapConfig(env: OtelBootstrapEnv): ResolvedOtelBootstrapConfig {
  const endpoint = env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const serviceName = env.VITE_OTEL_SERVICE_NAME?.trim() || OTEL_DEFAULT_SERVICE_NAME;
  const environment = env.VITE_OTEL_ENVIRONMENT?.trim() || env.MODE;
  const enabled = env.PROD && env.VITE_ENABLE_OTEL === 'true' && Boolean(endpoint);

  return {
    enabled,
    ...(endpoint ? { endpoint } : {}),
    serviceName,
    environment,
    tracesSampleRate: normalizeSampleRate(env.VITE_OTEL_TRACES_SAMPLE_RATE),
  };
}

async function initOtelForReleaseStageOnce(): Promise<void> {
  const config = resolveOtelBootstrapConfig(import.meta.env);
  if (!config.enabled || !config.endpoint) {
    return;
  }

  try {
    const [
      sdkWebModule,
      sdkBaseModule,
      exporterModule,
      resourcesModule,
      semanticModule,
    ] = await Promise.all([
      import(/* @vite-ignore */ OTEL_MODULE_IDS.sdkTraceWeb),
      import(/* @vite-ignore */ OTEL_MODULE_IDS.sdkTraceBase),
      import(/* @vite-ignore */ OTEL_MODULE_IDS.exporterTraceOtlpHttp),
      import(/* @vite-ignore */ OTEL_MODULE_IDS.resources),
      import(/* @vite-ignore */ OTEL_MODULE_IDS.semanticConventions),
    ]);

    const sdkWeb = sdkWebModule as Record<string, unknown>;
    const sdkBase = sdkBaseModule as Record<string, unknown>;
    const otlp = exporterModule as Record<string, unknown>;
    const resources = resourcesModule as Record<string, unknown>;
    const semantics = semanticModule as Record<string, unknown>;

    const WebTracerProvider = sdkWeb.WebTracerProvider as (new (config?: unknown) => unknown) | undefined;
    const BatchSpanProcessor = sdkBase.BatchSpanProcessor as (new (exporter: unknown) => unknown) | undefined;
    const ParentBasedSampler = sdkBase.ParentBasedSampler as (new (config: { root: unknown }) => unknown) | undefined;
    const TraceIdRatioBasedSampler = sdkBase.TraceIdRatioBasedSampler as (new (ratio: number) => unknown) | undefined;
    const OTLPTraceExporter = otlp.OTLPTraceExporter as (new (config?: unknown) => unknown) | undefined;
    const resourceFromAttributes = resources.resourceFromAttributes as ((attributes: Record<string, unknown>) => unknown) | undefined;

    if (!WebTracerProvider || !BatchSpanProcessor || !OTLPTraceExporter || !ParentBasedSampler || !TraceIdRatioBasedSampler) {
      console.warn('[Jieyu] OTel bootstrap skipped: required SDK exports are unavailable.');
      return;
    }

    const serviceNameAttr = typeof semantics.ATTR_SERVICE_NAME === 'string'
      ? semantics.ATTR_SERVICE_NAME
      : 'service.name';
    const deploymentEnvAttr = typeof semantics.ATTR_DEPLOYMENT_ENVIRONMENT_NAME === 'string'
      ? semantics.ATTR_DEPLOYMENT_ENVIRONMENT_NAME
      : 'deployment.environment.name';

    const resource = resourceFromAttributes
      ? resourceFromAttributes({
          [serviceNameAttr]: config.serviceName,
          [deploymentEnvAttr]: config.environment,
        })
      : undefined;

    const providerConfig = {
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(config.tracesSampleRate),
      }),
      ...(resource ? { resource } : {}),
    };

    const provider = new WebTracerProvider(providerConfig) as {
      addSpanProcessor?: (processor: unknown) => void;
      register?: () => void;
    };
    const exporter = new OTLPTraceExporter({
      url: config.endpoint,
    });

    if (typeof provider.addSpanProcessor === 'function') {
      provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    }

    if (typeof provider.register === 'function') {
      provider.register();
      return;
    }

    console.warn('[Jieyu] OTel bootstrap skipped: tracer provider register() is unavailable.');
  } catch (error) {
    // OTel 初始化失败不应阻塞应用启动 | OTel initialization failure must not block app startup
    console.warn('[Jieyu] OTel bootstrap failed; tracing disabled for this session.', error);
  }
}

export function initOtelForReleaseStage(): Promise<void> {
  if (!otelInitPromise) {
    otelInitPromise = initOtelForReleaseStageOnce();
  }
  return otelInitPromise;
}
