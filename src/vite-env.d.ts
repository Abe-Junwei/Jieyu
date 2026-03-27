/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_ENABLE_SENTRY?: string;
	readonly VITE_SENTRY_DSN?: string;
	readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
	readonly VITE_SENTRY_RELEASE?: string;
	readonly VITE_SENTRY_ENVIRONMENT?: string;
	readonly VITE_SENTRY_SEND_DEFAULT_PII?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
