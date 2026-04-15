/**
 * TranscriptionPage - Orchestrator Shell
 * 轻量壳组件，仅负责数据装载与 ready 运行时渲染 | Lightweight shell that only loads data and mounts the ready runtime.
 *
 * Ready 态重包与 transcription-entry.css 经 lazy 进入独立 chunk，便于构建侧拆分 CSS | Ready workspace + entry CSS load in a separate chunk for CSS code-splitting.
 */

import { lazy, Suspense } from 'react';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { t, useLocale } from '../i18n';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';

const TranscriptionPageReadyWorkspace = lazy(async () => {
  const mod = await import('./TranscriptionPage.ReadyWorkspace');
  return { default: mod.TranscriptionPageReadyWorkspace };
});

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
    <Suspense fallback={<p className="hint">{t(locale, 'transcription.status.loading')}</p>}>
      <TranscriptionPageReadyWorkspace
        data={data}
        {...(appSearchRequest !== undefined ? { appSearchRequest } : {})}
        {...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {})}
      />
    </Suspense>
  );
}

export { TranscriptionPageOrchestrator as TranscriptionPage };
