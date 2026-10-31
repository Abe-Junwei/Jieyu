import { useEffect, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function DesktopMediaReregisterPanel(props: {
  sessionId: string;
  desktopCall: DesktopReadHost['desktopCall'];
}) {
  const locale = useLocale();
  const [relpath, setRelpath] = useState('');
  const [duration, setDuration] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const { sessionId, desktopCall } = props;

  useEffect(() => {
    let cancelled = false;
    void createDesktopClient({ desktopCall })
      .listMedia(sessionId)
      .then((rows) => {
        if (!cancelled) setNames(rows.map((row) => row.filename));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopCall, revision, sessionId]);

  const register = () => {
    const seconds = Number(duration);
    if (relpath.trim().length === 0 || !Number.isFinite(seconds) || seconds <= 0) return;
    setError(false);
    const client = createDesktopClient({ desktopCall });
    void client
      .reregisterMedia(sessionId, { relpath: relpath.trim(), duration: seconds })
      .then(async (result) => {
        const chosen = result.status === 'choose' ? result.ids[0] : undefined;
        if (chosen !== undefined) await client.restoreRegisteredMedia(sessionId, chosen);
        setRelpath('');
        setDuration('');
        setRevision((current) => current + 1);
      })
      .catch(() => setError(true));
  };

  return (
    <section aria-label={t(locale, 'app.desktopRead.registerRecording')}>
      {error ? <p role="alert">{t(locale, 'app.desktopRead.loadFailed')}</p> : null}
      <ul>
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <input
        aria-label={t(locale, 'app.desktopRead.registerPath')}
        value={relpath}
        onChange={(event) => setRelpath(event.currentTarget.value)}
      />
      <input
        aria-label={t(locale, 'app.desktopRead.registerDuration')}
        value={duration}
        onChange={(event) => setDuration(event.currentTarget.value)}
      />
      <button type="button" onClick={register}>
        {t(locale, 'app.desktopRead.registerRecording')}
      </button>
    </section>
  );
}
