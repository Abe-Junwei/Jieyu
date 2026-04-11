import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initSentryForReleaseStage } from './observability/sentry';
import './styles/app-foundation.css';

void initSentryForReleaseStage();

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
