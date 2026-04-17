export interface SentryBootstrapEnv {
  PROD: boolean;
  MODE: string;
  VITE_ENABLE_SENTRY?: string;
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  VITE_SENTRY_RELEASE?: string;
  VITE_SENTRY_ENVIRONMENT?: string;
  VITE_SENTRY_SEND_DEFAULT_PII?: string;
  VITE_SENTRY_ENABLE_BROWSER_TRACING?: string;
}

export interface ResolvedSentryBootstrapConfig {
  enabled: boolean;
  dsn?: string;
  environment: string;
  tracesSampleRate: number;
  release?: string;
  sendDefaultPii: boolean;
  enableBrowserTracing: boolean;
}

type SentryInitOptions = Parameters<typeof import('@sentry/react').init>[0];
type SentryBeforeSend = NonNullable<SentryInitOptions['beforeSend']>;
type SentryRuntimeModule = typeof import('@sentry/react');
type SentryRuntimeLoader = () => Promise<SentryRuntimeModule>;

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
    enableBrowserTracing: env.VITE_SENTRY_ENABLE_BROWSER_TRACING !== 'false',
  };
}

export async function initSentryForReleaseStage(): Promise<void> {
  const config = resolveSentryBootstrapConfig(import.meta.env);
  await initSentryWithResolvedConfig(config);
}

export async function initSentryWithResolvedConfig(
  config: ResolvedSentryBootstrapConfig,
  loadSentryRuntime: SentryRuntimeLoader = () => import('@sentry/react'),
): Promise<void> {

  if (!config.enabled || !config.dsn) {
    return;
  }

  try {
    const Sentry = await loadSentryRuntime();
    const beforeSend: SentryBeforeSend = (event) => {
      if ('user' in event) {
        delete event.user;
      }
      // 清理面包屑和扩展数据中的敏感信息 | Scrub PII from breadcrumbs & extras
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.data) {
            for (const key of Object.keys(bc.data)) {
              if (/api.?key|token|password|secret|authorization/i.test(key)) {
                bc.data[key] = '[REDACTED]';
              }
            }
          }
        }
      }
      if (event.extra) {
        for (const key of Object.keys(event.extra)) {
          if (/api.?key|token|password|secret|authorization/i.test(key)) {
            event.extra[key] = '[REDACTED]';
          }
        }
      }
      return event;
    };

    Sentry.init({
      dsn: config.dsn,
      enabled: true,
      environment: config.environment,
      integrations: config.enableBrowserTracing ? [Sentry.browserTracingIntegration()] : [],
      tracesSampleRate: config.tracesSampleRate,
      ...(config.release ? { release: config.release } : {}),
      sendDefaultPii: config.sendDefaultPii,
      ...(config.sendDefaultPii ? {} : { beforeSend }),
    });
  } catch (error) {
    // Sentry 初始化失败不应阻塞应用启动 | Sentry initialization must not block app startup
    console.warn('[Jieyu] Sentry bootstrap failed; error reporting disabled for this session.', error);
  }
}
