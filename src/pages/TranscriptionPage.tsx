import { Navigate } from 'react-router-dom';
import { DesktopUnavailable } from '../components/DesktopRoute';
import { ProjectLanguageListsEditorHost } from '../components/ProjectLanguageListsDialog';
import { ProjectLanguageListsLoader } from '../components/ProjectLanguageListsContext';
import { resolveDesktopSurface } from '../desktop/desktopSurface';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { TranscriptionPage as TranscriptionPageOrchestrator } from './TranscriptionPage.Orchestrator';

interface TranscriptionPageProps {
  appSearchRequest?: import('../utils/appShellEvents').AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

export function TranscriptionPage(props: TranscriptionPageProps) {
  const surface = resolveDesktopSurface(readDesktopProjectHost());
  if (surface === 'unavailable') return <DesktopUnavailable />;
  if (surface === 'desktop') return <Navigate to="/desktop-project" replace />;
  return (
    <ProjectLanguageListsLoader>
      <TranscriptionPageOrchestrator {...props} />
      <ProjectLanguageListsEditorHost />
    </ProjectLanguageListsLoader>
  );
}
