import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initOtelForReleaseStage } from './observability/otel';
import { initSentryForReleaseStage } from './observability/sentry';
import { initLcpMetricObserver } from './observability/webVitals';
import { initIconEffect } from './utils/iconEffect';
import { initTheme } from './utils/theme';
import './styles/app-foundation.css';

void initOtelForReleaseStage();
void initSentryForReleaseStage();
initLcpMetricObserver();
initTheme(); // 初始化配色主题 | Initialize appearance theme
initIconEffect(); // 图标效果 material / motion | Icon effect preference

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
      console.warn(
        '[bootstrap] Failed to load language display baseline JSON; built-in language labels may be missing until reload or network recovery',
        error,
      );
      langCache.primeLanguageCatalogRuntimeCacheForSession({
        entries: {},
        aliasToId: {},
        lookupToId: {},
        updatedAt: '',
      });
    }
  } catch (error) {
    console.warn('[bootstrap] Language geodata bootstrap failed unexpectedly', error);
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

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

/** B-1 + B-5：首屏门闩 — 当前界面语言词表与 VAD 浏览器后端并行就绪后再挂载根组件。 */
void (async () => {
  try {
    const { detectLocale, preloadLocaleDictionary } = await import('./i18n');
    const locale = detectLocale();
    await Promise.all([
      preloadLocaleDictionary(locale),
      import('./services/vad/VadMediaBackend.browser'),
    ]);
  } catch (error) {
    console.warn('[bootstrap] i18n preload or VAD backend failed; mounting with zh-CN / VAD fallback if applicable', error);
  }
  mountApp();
})();
