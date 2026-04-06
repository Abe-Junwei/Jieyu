/**
 * TranscriptionPage - Orchestrator Shell
 * 轻量壳组件，仅负责数据装载与 ready 运行时渲染 | Lightweight shell that only loads data and mounts the ready runtime.
 */

import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { t, useLocale } from '../i18n';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { TranscriptionPageReadyWorkspace } from './TranscriptionPage.ReadyWorkspace';

interface TranscriptionPageOrchestratorProps {
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

function TranscriptionPageOrchestrator({
  appSearchRequest,
  onConsumeAppSearchRequest,
}: TranscriptionPageOrchestratorProps) {
  const locale = useLocale();
  const data = useTranscriptionData();

  if (data.state.phase === 'loading') {
    return <p className="hint">{t(locale, 'transcription.status.loading')}</p>;
  }

  if (data.state.phase === 'error') {
    return <p className="error">{data.state.message}</p>;
  }

  return (
    <TranscriptionPageReadyWorkspace
      data={data}
      {...(appSearchRequest !== undefined ? { appSearchRequest } : {})}
      {...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {})}
    />
  );
}

export { TranscriptionPageOrchestrator as TranscriptionPage };
