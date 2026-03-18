export async function initSentryForReleaseStage(): Promise<void> {
  const enabled = import.meta.env.PROD && import.meta.env.VITE_ENABLE_SENTRY === 'true';
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!enabled || !dsn) {
    return;
  }

  // Placeholder gate for release stage.
  // Once SDK dependency is introduced, initialize Sentry here.
  console.info('[observability] Sentry gate enabled, pending SDK integration.');
}
