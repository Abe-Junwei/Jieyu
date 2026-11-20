import { useEffect, useState, type ReactNode } from 'react';
import {
  electronDesktopPresent,
  sessionExpiredMessage,
  resolveDesktopSurface,
} from '../desktop/desktopSurface';
import { forgetOpenProjectSession, readOpenProjectSession } from '../desktop/openProjectSession';
import { readDesktopProjectHost, type DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function DesktopUnavailable() {
  const locale = useLocale();
  const key = electronDesktopPresent()
    ? 'app.desktopRead.unavailable'
    : 'app.desktopRead.openInApp';
  return <p data-testid="desktop-unavailable">{t(locale, key)}</p>;
}

export function DesktopRoute(props: {
  desktop: (host: DesktopReadHost) => ReactNode;
  /** Folder and home skip the open-project session check. */
  folder?: boolean;
}) {
  const host = readDesktopProjectHost();
  const surface = resolveDesktopSurface(host);
  if (surface !== 'desktop' || host === null) return <DesktopUnavailable />;
  if (props.folder) return props.desktop(host);
  return <DesktopSessionGate host={host} desktop={props.desktop} />;
}

function DesktopSessionGate(props: {
  host: DesktopReadHost;
  desktop: (host: DesktopReadHost) => ReactNode;
}) {
  const sessionId = readOpenProjectSession();
  const [phase, setPhase] = useState<'check' | 'ready' | 'folder' | 'unavailable'>(
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
        setPhase('unavailable');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [props.host, sessionId]);

  if (sessionId === null || phase === 'folder') {
    return props.desktop(props.host);
  }
  if (phase === 'unavailable') return <DesktopUnavailable />;
  if (phase !== 'ready') return null;
  return props.desktop(props.host);
}
