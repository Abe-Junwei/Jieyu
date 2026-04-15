import { TranscriptionPage as TranscriptionPageOrchestrator } from './TranscriptionPage.Orchestrator';

interface TranscriptionPageProps {
  appSearchRequest?: import('../utils/appShellEvents').AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

export function TranscriptionPage(props: TranscriptionPageProps) {
  return <TranscriptionPageOrchestrator {...props} />;
}
