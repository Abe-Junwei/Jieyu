import { TranscriptionPage as TranscriptionPageOrchestrator } from './TranscriptionPage.Orchestrator';
import '../styles/transcription-entry.css';

interface TranscriptionPageProps {
  appSearchRequest?: import('../utils/appShellEvents').AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

export function TranscriptionPage(props: TranscriptionPageProps) {
  return <TranscriptionPageOrchestrator {...props} />;
}
