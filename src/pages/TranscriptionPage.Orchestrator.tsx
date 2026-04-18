/**
 * TranscriptionPage - Orchestrator Shell
 * 轻量壳组件，仅负责数据装载与 ready 运行时渲染 | Lightweight shell that only loads data and mounts the ready runtime.
 *
 * Ready 态重包与 transcription-entry.css 经 lazy 进入独立 chunk，便于构建侧拆分 CSS | Ready workspace + entry CSS load in a separate chunk for CSS code-splitting.
 */

import { useLocale } from '../i18n';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { TranscriptionPageDataShell } from './TranscriptionPage.DataShell';

interface TranscriptionPageOrchestratorProps {
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

function TranscriptionPageOrchestrator({
  appSearchRequest,
  onConsumeAppSearchRequest,
}: TranscriptionPageOrchestratorProps) {
  const locale = useLocale();
  return (
    <TranscriptionPageDataShell
      locale={locale}
      {...(appSearchRequest !== undefined ? { appSearchRequest } : {})}
      {...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {})}
    />
  );
}

export { TranscriptionPageOrchestrator as TranscriptionPage };
