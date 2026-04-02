import { Suspense, lazy } from 'react';
import '../styles/transcription.css';
import { t, useLocale } from '../i18n';

interface TranscriptionPageProps {
  appSearchRequest?: import('../utils/appShellEvents').AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

const TranscriptionPageOrchestrator = lazy(async () => import('./TranscriptionPage.Orchestrator').then((module) => ({
	default: module.TranscriptionPage,
})));

export function TranscriptionPage(props: TranscriptionPageProps) {
  const locale = useLocale();

  return (
    <Suspense
      fallback={(
        <section className="panel" role="status" aria-live="polite" aria-busy="true">
          <p>{t(locale, 'transcription.status.loading')}</p>
        </section>
      )}
    >
      <TranscriptionPageOrchestrator {...props} />
    </Suspense>
  );
}
