import { Navigate, useNavigate } from 'react-router-dom';
import { readOpenProjectSession } from '../desktop/openProjectSession';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { DesktopCorpusQueryPanel } from './DesktopCorpusQueryPanel';
import { desktopCorpusLocateHref } from './desktopCorpusLocate';
import '../styles/pages/desktop-project-read.css';

export function DesktopCorpusPage() {
  const host = readDesktopProjectHost();
  const sessionId = readOpenProjectSession();
  const navigate = useNavigate();
  if (host === null || sessionId === null) return <Navigate to="/desktop-project" replace />;
  return (
    <section className="desktop-project-read">
      <DesktopCorpusQueryPanel
        host={host}
        sessionId={sessionId}
        onLocate={(manuscriptId, layerId, unitId) => {
          void navigate(desktopCorpusLocateHref({ manuscriptId, layerId, unitId }));
        }}
      />
    </section>
  );
}
