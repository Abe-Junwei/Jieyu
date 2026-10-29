import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { sessionExpiredMessage, resolveDesktopSurface } from '../desktop/desktopSurface';
import { forgetOpenProjectSession, readOpenProjectSession } from '../desktop/openProjectSession';
import { readDesktopProjectHost, type DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function DesktopUnavailable() {
  const locale = useLocale();
  return <p data-testid="desktop-unavailable">{t(locale, 'app.desktopRead.unavailable')}</p>;
}

export function DesktopRoute(props: {
  desktop: (host: DesktopReadHost) => ReactNode;
  legacy: ReactNode;
  /** The folder page is the place a missing session returns to, so it does not require one. */
  folder?: boolean;
}) {
  const host = readDesktopProjectHost();
  const surface = resolveDesktopSurface(host);
  if (surface === 'legacy') return props.legacy;
  if (host === null) return <DesktopUnavailable />;
  if (props.folder) return props.desktop(host);
  return <DesktopSessionGate host={host} desktop={props.desktop} />;
}

function DesktopSessionGate(props: {
  host: DesktopReadHost;
  desktop: (host: DesktopReadHost) => ReactNode;
}) {
  const sessionId = readOpenProjectSession();
  const [phase, setPhase] = useState<'check' | 'ready' | 'folder'>(
    sessionId === null ? 'folder' : 'check',
  );

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    void props.host.desktopCall(sessionId, 'manuscripts.list', {}).then(
      () => {
        if (!cancelled) setPhase('ready');
      },
      (error: unknown) => {
        if (cancelled) return;
        if (sessionExpiredMessage(error)) {
          forgetOpenProjectSession();
          setPhase('folder');
          return;
        }
        setPhase('ready');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [props.host, sessionId]);

  if (sessionId === null || phase === 'folder') {
    return <Navigate to="/desktop-project" replace />;
  }
  if (phase !== 'ready') return null;
  return props.desktop(props.host);
}
