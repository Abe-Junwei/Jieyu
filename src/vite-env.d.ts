/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
	/** Package version from `package.json`, injected at build (`vite.config.ts`). */
	readonly VITE_APP_VERSION: string;
	readonly VITE_M5_OBSERVABILITY_ENV?: string;
	readonly VITE_ENABLE_SENTRY?: string;
	readonly VITE_SENTRY_DSN?: string;
	readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
	readonly VITE_SENTRY_RELEASE?: string;
	readonly VITE_SENTRY_ENVIRONMENT?: string;
	readonly VITE_SENTRY_SEND_DEFAULT_PII?: string;
	readonly VITE_SENTRY_ENABLE_BROWSER_TRACING?: string;
	readonly VITE_ENABLE_OTEL?: string;
	readonly VITE_OTEL_EXPORT_ENABLED?: string;
	readonly VITE_OTEL_EXPORTER_OTLP_ENDPOINT?: string;
	readonly VITE_OTEL_SERVICE_NAME?: string;
	readonly VITE_OTEL_TRACES_SAMPLE_RATE?: string;
	readonly VITE_OTEL_ENVIRONMENT?: string;
	readonly VITE_OTEL_EXPORT_TIMEOUT_MS?: string;
	readonly VITE_OTEL_BSP_MAX_QUEUE_SIZE?: string;
	readonly VITE_OTEL_BSP_MAX_EXPORT_BATCH_SIZE?: string;
	readonly VITE_OTEL_BSP_SCHEDULE_DELAY_MS?: string;
	readonly VITE_OTEL_CIRCUIT_BREAKER_FAILURE_THRESHOLD?: string;
	readonly VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS?: string;
	readonly VITE_MAP_PROXY_BASE_URL?: string;
	readonly VITE_MAP_PROXY_FALLBACK_ON_ERROR?: string;
	/** BAS Web Services / WebMAUS host (no trailing slash), e.g. Munich BAS deployment */
	readonly VITE_BAS_WEBSERVICES_BASE_URL?: string;
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
