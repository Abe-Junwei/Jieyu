import { ProjectLanguageListsEditorHost } from '../components/ProjectLanguageListsDialog';
import { ProjectLanguageListsLoader } from '../components/ProjectLanguageListsContext';
import { TranscriptionPage as TranscriptionPageOrchestrator } from './TranscriptionPage.Orchestrator';

interface TranscriptionPageProps {
  appSearchRequest?: import('../utils/appShellEvents').AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

export function TranscriptionPage(props: TranscriptionPageProps) {
  return (
    <ProjectLanguageListsLoader>
      <TranscriptionPageOrchestrator {...props} />
      <ProjectLanguageListsEditorHost />
    </ProjectLanguageListsLoader>
  );
}
