/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_APP_VERSION?: string;
	readonly VITE_M5_OBSERVABILITY_ENV?: string;
	readonly VITE_ENABLE_SENTRY?: string;
	readonly VITE_SENTRY_DSN?: string;
	readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
	readonly VITE_SENTRY_RELEASE?: string;
	readonly VITE_SENTRY_ENVIRONMENT?: string;
	readonly VITE_SENTRY_SEND_DEFAULT_PII?: string;
	readonly VITE_MAP_PROXY_BASE_URL?: string;
	readonly VITE_MAP_PROXY_FALLBACK_ON_ERROR?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
