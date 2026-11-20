import { Link, useNavigate } from 'react-router-dom';
import { readOpenProjectSession } from '../desktop/openProjectSession';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { DesktopCorpusQueryPanel } from './DesktopCorpusQueryPanel';
import { desktopCorpusLocateHref } from './desktopCorpusLocate';
import '../styles/pages/desktop-project-read.css';

export function DesktopCorpusPage() {
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const sessionId = readOpenProjectSession();
  const navigate = useNavigate();
  if (host === null) return null;
  return (
    <section className="desktop-project-read">
      {sessionId === null ? (
        <Link to="/desktop-project">{t(locale, 'app.desktopRead.openFolder')}</Link>
      ) : (
        <DesktopCorpusQueryPanel
          host={host}
          sessionId={sessionId}
          onLocate={(manuscriptId, layerId, unitId) => {
            void navigate(desktopCorpusLocateHref({ manuscriptId, layerId, unitId }));
          }}
        />
      )}
    </section>
  );
}
