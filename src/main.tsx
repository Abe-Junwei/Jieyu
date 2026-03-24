import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initSentryForReleaseStage } from './observability/sentry';
import './styles/global.css';
import './styles/transcription.css';
import './styles/ai-hub.css';
import './styles/shared.css';

void initSentryForReleaseStage();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
