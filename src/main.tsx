// Electron's header CSP blocks the inline refresh script Vite inserts into index.html.
import '@vitejs/plugin-react/preamble';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { featureFlags } from './ai/config/featureFlags';
import { App } from './App';
import { installSqliteIpcPortIfEnabled, readDesktopStorageCall } from './db/installSqliteIpcPort';
import { initOtelForReleaseStage } from './observability/otel';
import { initSentryForReleaseStage } from './observability/sentry';
import { initLcpMetricObserver } from './observability/webVitals';
import { createLogger } from './observability/logger';
import { initIconEffect } from './utils/iconEffect';
import { initTheme } from './utils/theme';
import { requestPersistAtStartup } from './utils/storageDurability';
import { fireAndForget } from './utils/fireAndForget';
import './styles/app-foundation.css';

const log = createLogger('main');

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
initTheme(); // 初始化配色主题 | Initialize appearance theme
initIconEffect(); // 图标效果 material / motion | Icon effect preference
// 启动时的申请只记录结果；第一次导入 / 保存时再伴随手势申请（6.2）
// Startup attempt is recorded; the first import / save gesture asks again (6.2)
void requestPersistAtStartup();

// 4a：浏览器自动化下加载迁移框架探针（只操作合成库）| 4a: migration probe under webdriver only
if (typeof navigator !== 'undefined' && navigator.webdriver) {
  fireAndForget(
    import('./db/migration/e2eMigrationHarness').then((module) =>
      module.installE2eMigrationHarness(),
    ),
    { context: 'src/main.tsx:L52', policy: 'background' },
  );
}
// 上次没做完的项目清理（删除 / 仅从本机移除 / 云端已删除）在启动时接着做完（rev5 9.1，T24）
// Finish project cleanup jobs interrupted by a closed page (rev5 9.1, T24)
void import('./services/projectLocalCleanupJobs')
  .then(({ resumeProjectCleanupJobs }) => resumeProjectCleanupJobs())
  .then(({ failed }) => {
    if (failed.length > 0) log.warn('project cleanup jobs still pending after resume', { failed });
  })
  .catch((error: unknown) => {
    log.warn('failed to resume project cleanup jobs', { err: error });
  });

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
        // 语言资产数据变化频率低，5 分钟内视为新鲜 | Language asset data changes infrequently
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  });

  // 数据路由才能用 useBlocker；单条 `*` 路由包住 App，App 里的 <Routes> 不变。
  const router = createBrowserRouter([
    {
      path: '*',
      element: (
        <QueryClientProvider client={queryClient}>
          <App />
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

/** B-1 + B-5：首屏门闩 — 当前界面语言词表与 VAD 浏览器后端并行就绪后再挂载根组件。 */
void (async () => {
  try {
    const { dropDevServiceWorkerRegistration } = await import('./utils/devRuntimeRecovery');
    const droppedStaleWorker = await dropDevServiceWorkerRegistration();
    if (droppedStaleWorker) {
      window.location.reload();
      return;
    }
  } catch (error) {
    log.warn('dev service worker recovery failed; continuing boot', { err: error });
  }
  try {
    const { detectLocale, preloadLocaleDictionary } = await import('./i18n');
    const locale = detectLocale();
    await Promise.all([
      preloadLocaleDictionary(locale),
      import('./services/vad/VadMediaBackend.browser'),
    ]);
  } catch (error) {
    log.warn(
      'i18n preload or VAD backend failed; mounting with zh-CN / VAD fallback if applicable',
      { err: error },
    );
  }
  mountApp();
})();
