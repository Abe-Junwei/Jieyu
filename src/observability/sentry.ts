export interface SentryBootstrapEnv {
  PROD: boolean;
  MODE: string;
  VITE_ENABLE_SENTRY?: string;
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  VITE_SENTRY_RELEASE?: string;
  VITE_SENTRY_ENVIRONMENT?: string;
  VITE_SENTRY_SEND_DEFAULT_PII?: string;
}

export interface ResolvedSentryBootstrapConfig {
  enabled: boolean;
  dsn?: string;
  environment: string;
  tracesSampleRate: number;
  release?: string;
  sendDefaultPii: boolean;
}

function normalizeSampleRate(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? '0');
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

export function resolveSentryBootstrapConfig(env: SentryBootstrapEnv): ResolvedSentryBootstrapConfig {
  const dsn = env.VITE_SENTRY_DSN?.trim();
  const release = env.VITE_SENTRY_RELEASE?.trim();
  const environment = env.VITE_SENTRY_ENVIRONMENT?.trim() || env.MODE;
  const enabled = env.PROD && env.VITE_ENABLE_SENTRY === 'true' && Boolean(dsn);

  return {
    enabled,
    ...(dsn ? { dsn } : {}),
    environment,
    tracesSampleRate: normalizeSampleRate(env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    ...(release ? { release } : {}),
    sendDefaultPii: env.VITE_SENTRY_SEND_DEFAULT_PII === 'true',
  };
}

export async function initSentryForReleaseStage(): Promise<void> {
  const config = resolveSentryBootstrapConfig(import.meta.env);

  if (!config.enabled || !config.dsn) {
    return;
  }

  const Sentry = await import('@sentry/react');

  Sentry.init({
    dsn: config.dsn,
    enabled: true,
    environment: config.environment,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: config.tracesSampleRate,
    ...(config.release ? { release: config.release } : {}),
    sendDefaultPii: config.sendDefaultPii,
    ...(config.sendDefaultPii
      ? {}
      : {
          beforeSend: (event: Parameters<NonNullable<typeof Sentry.init extends (options: infer T) => unknown ? T['beforeSend'] : never>>[0]) => {
            if ('user' in event) {
              delete event.user;
            }
            return event;
          },
        }),
  });
}
