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
import './services/vad/VadMediaBackend.browser'; // 注册浏览器端 VAD 后端 | Register browser VAD backend
import './styles/app-foundation.css';

void initOtelForReleaseStage();
void initSentryForReleaseStage();
initLcpMetricObserver();
initTheme(); // 初始化配色主题 | Initialize appearance theme
initIconEffect(); // 图标效果 material / motion | Icon effect preference

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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
