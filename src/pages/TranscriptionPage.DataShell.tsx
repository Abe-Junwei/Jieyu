/**
 * Transcription page data + ready runtime shell (separate module for stable Fast Refresh / hook fiber).
 * 独立模块以便 HMR 与 hook 调度稳定 | Separate module for stable HMR and hook scheduling.
 */

import { lazy, Suspense } from 'react';
import { ToastProvider } from '../contexts/ToastContext';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { t, type Locale } from '../i18n';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';

const TranscriptionPageReadyWorkspace = lazy(async () => {
  const mod = await import('./TranscriptionPage.ReadyWorkspace');
  return { default: mod.TranscriptionPageReadyWorkspace };
});

export interface TranscriptionPageDataShellProps {
  locale: Locale;
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

export function TranscriptionPageDataShell({
  locale,
  appSearchRequest,
  onConsumeAppSearchRequest,
}: TranscriptionPageDataShellProps) {
  const data = useTranscriptionData();

  if (data.state.phase === 'loading') {
    return (
      <p className="hint" data-testid="transcription-page-loading">
        {t(locale, 'transcription.status.loading')}
      </p>
    );
  }

  if (data.state.phase === 'error') {
    return <p className="error">{data.state.message}</p>;
  }

  return (
    <ToastProvider>
      <Suspense fallback={(
        <p className="hint" data-testid="transcription-page-loading">
          {t(locale, 'transcription.status.loading')}
        </p>
      )}
      >
        <TranscriptionPageReadyWorkspace
          data={data}
          {...(appSearchRequest !== undefined ? { appSearchRequest } : {})}
          {...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {})}
        />
      </Suspense>
    </ToastProvider>
  );
}
