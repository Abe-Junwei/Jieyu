import { useEffect, useRef, useState } from 'react';
import { tf, t, useLocale } from '../i18n';

type BackupErrorKey =
  | 'app.desktopRead.backupOccupied'
  | 'app.desktopRead.backupFailed'
  | 'app.desktopRead.backupOpenFailed';

type BackupPanelProps = {
  sessionId: string;
  listDailyBackups: (sessionId: string) => Promise<{ days: string[] }>;
  restoreDailyBackup: (
    sessionId: string,
    day: string,
  ) => Promise<{ cancelled: true } | { folder: string }>;
  openRestoredBackup?: ((sessionId: string) => Promise<{ sessionId: string }>) | undefined;
  onOpened?: ((sessionId: string) => void) | undefined;
};

export function DesktopDailyBackupPanel(props: BackupPanelProps) {
  return <SessionBackups key={props.sessionId} {...props} />;
}

function SessionBackups(props: BackupPanelProps) {
  const { sessionId, listDailyBackups, restoreDailyBackup, openRestoredBackup, onOpened } = props;
  const locale = useLocale();
  const liveSession = useRef<string | null>(sessionId);
  const restoringRef = useRef(false);
  const openingRef = useRef(false);
  liveSession.current = sessionId;
  const [days, setDays] = useState<string[]>([]);
  const [listFailed, setListFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [opening, setOpening] = useState(false);
  const [restoredPath, setRestoredPath] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<BackupErrorKey | null>(null);

  useEffect(() => {
    liveSession.current = sessionId;
    let current = true;
    setDays([]);
    setListFailed(false);
    setPending(null);
    setRestoredPath(null);
    setErrorKey(null);
    void listDailyBackups(sessionId)
      .then((listed) => {
        if (current) setDays(listed.days);
      })
      .catch(() => {
        if (current) setListFailed(true);
      });
    return () => {
      current = false;
      liveSession.current = null;
    };
  }, [listDailyBackups, sessionId]);

  const confirmRestore = () => {
    if (pending === null || restoringRef.current) return;
    const day = pending;
    const seen = sessionId;
    restoringRef.current = true;
    setRestoring(true);
    setErrorKey(null);
    void restoreDailyBackup(sessionId, day)
      .then((result) => {
        if (liveSession.current !== seen) return;
        if ('cancelled' in result) {
          setPending(null);
          return;
        }
        setPending(null);
        setRestoredPath(result.folder);
      })
      .catch((error: unknown) => {
        if (liveSession.current !== seen) return;
        setPending(null);
        setRestoredPath(null);
        setErrorKey(backupErrorKey(error));
      })
      .finally(() => {
        restoringRef.current = false;
        if (liveSession.current === seen) setRestoring(false);
      });
  };

  const openCopy = () => {
    if (openingRef.current || restoredPath === null || openRestoredBackup === undefined) return;
    const seen = sessionId;
    openingRef.current = true;
    setOpening(true);
    setErrorKey(null);
    void openRestoredBackup(sessionId)
      .then((opened) => {
        if (liveSession.current !== seen) return;
        onOpened?.(opened.sessionId);
      })
      .catch(() => {
        if (liveSession.current !== seen) return;
        setErrorKey('app.desktopRead.backupOpenFailed');
      })
      .finally(() => {
        openingRef.current = false;
        if (liveSession.current === seen) setOpening(false);
      });
  };

  return (
    <section aria-labelledby="desktop-daily-backup-title">
      <h2 id="desktop-daily-backup-title">{t(locale, 'app.desktopRead.backupTitle')}</h2>
      {listFailed ? <p role="alert">{t(locale, 'app.desktopRead.backupListFailed')}</p> : null}
      {!listFailed && days.length === 0 ? <p>{t(locale, 'app.desktopRead.backupEmpty')}</p> : null}
      <ul>
        {days.map((day) => (
          <li key={day}>
            <span>{day}</span>
            <button
              type="button"
              disabled={pending !== null || restoring}
              onClick={() => setPending(day)}
            >
              {t(locale, 'app.desktopRead.backupRestore')}
            </button>
          </li>
        ))}
      </ul>
      {restoring ? <p>{t(locale, 'app.desktopRead.backupRestoring')}</p> : null}
      {restoredPath === null ? null : (
        <p>{tf(locale, 'app.desktopRead.backupRestored', { path: restoredPath })}</p>
      )}
      {restoredPath === null || openRestoredBackup === undefined ? null : (
        <button type="button" disabled={opening} onClick={openCopy}>
          {t(locale, 'app.desktopRead.backupOpen')}
        </button>
      )}
      {errorKey === null ? null : <p role="alert">{t(locale, errorKey)}</p>}
      {pending === null ? null : (
        <div role="dialog" aria-labelledby="desktop-daily-backup-confirm">
          <h2 id="desktop-daily-backup-confirm">
            {t(locale, 'app.desktopRead.backupConfirmTitle')}
          </h2>
          <p>{t(locale, 'app.desktopRead.backupConfirmBody')}</p>
          <button type="button" disabled={restoring} onClick={() => setPending(null)}>
            {t(locale, 'app.desktopRead.backupCancel')}
          </button>
          <button type="button" disabled={restoring} onClick={confirmRestore}>
            {t(locale, 'app.desktopRead.backupConfirm')}
          </button>
        </div>
      )}
    </section>
  );
}

function backupErrorKey(error: unknown): BackupErrorKey {
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'import destination is not empty' ||
    message.endsWith(': import destination is not empty')
  ) {
    return 'app.desktopRead.backupOccupied';
  }
  return 'app.desktopRead.backupFailed';
}
