// Electron's header CSP blocks the inline refresh script Vite inserts into index.html.
import '@vitejs/plugin-react/preamble';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { featureFlags } from './ai/config/featureFlags';
import { DesktopApp } from './DesktopApp';
import { connectDesktopInvalidation } from './desktop/desktopQueryKeys';
import { installSqliteIpcPortIfEnabled, readDesktopStorageCall } from './db/installSqliteIpcPort';
import { initOtelForReleaseStage } from './observability/otel';
import { initSentryForReleaseStage } from './observability/sentry';
import { initLcpMetricObserver } from './observability/webVitals';
import { createLogger } from './observability/logger';
import { initTheme } from './utils/theme';
import './styles/app-foundation.css';
import './styles/pages/transcription-layout.css';

const log = createLogger('main.desktop');

installSqliteIpcPortIfEnabled({
  enabled: featureFlags.sqliteStoragePortEnabled,
  invoke: readDesktopStorageCall(),
});

function initGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    log.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error instanceof Error ? event.error.message : String(event.error ?? ''),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    log.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

initGlobalErrorHandlers();

void initOtelForReleaseStage();
void initSentryForReleaseStage();
initLcpMetricObserver();
initTheme();

void (async () => {
  try {
    const [{ ensureIso6393SeedsLoaded }, langCache] = await Promise.all([
      import('./data/iso6393Seed'),
      import('./data/languageCatalogRuntimeCache'),
    ]);
    await ensureIso6393SeedsLoaded();
    try {
      const baseline = await langCache.fetchLanguageCatalogBaselineRuntimeCache();
      langCache.primeLanguageCatalogRuntimeCacheForSession(baseline);
    } catch (error) {
      log.warn(
        'failed to load language display baseline JSON; built-in language labels may be missing until reload or network recovery',
        { err: error },
      );
      langCache.primeLanguageCatalogRuntimeCacheForSession({
        entries: {},
        aliasToId: {},
        lookupToId: {},
        updatedAt: '',
      });
    }
  } catch (error) {
    log.warn('language geodata bootstrap failed unexpectedly', { err: error });
  }
})();

function mountApp(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  });
  connectDesktopInvalidation(queryClient);

  const router = createBrowserRouter([
    {
      path: '*',
      element: (
        <QueryClientProvider client={queryClient}>
          <DesktopApp />
        </QueryClientProvider>
      ),
    },
  ]);

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}

void (async () => {
  try {
    const { detectLocale, preloadLocaleDictionary } = await import('./i18n');
    await preloadLocaleDictionary(detectLocale());
  } catch (error) {
    log.warn('i18n preload failed; mounting with zh-CN fallback if applicable', { err: error });
  }
  mountApp();
})();
