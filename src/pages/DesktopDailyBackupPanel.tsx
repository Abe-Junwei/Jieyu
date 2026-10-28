import { useEffect, useState } from 'react';
import { tf, t, useLocale } from '../i18n';

export function DesktopDailyBackupPanel(props: {
  sessionId: string;
  listDailyBackups: (sessionId: string) => Promise<{ days: string[] }>;
  restoreDailyBackup: (
    sessionId: string,
    day: string,
  ) => Promise<{ cancelled: true } | { folder: string }>;
}) {
  const { sessionId, listDailyBackups, restoreDailyBackup } = props;
  const locale = useLocale();
  const [days, setDays] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [restoredPath, setRestoredPath] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<
    'app.desktopRead.backupOccupied' | 'app.desktopRead.backupFailed' | null
  >(null);

  useEffect(() => {
    let current = true;
    void listDailyBackups(sessionId).then((listed) => {
      if (current) setDays(listed.days);
    });
    return () => {
      current = false;
    };
  }, [listDailyBackups, sessionId]);

  return (
    <section aria-labelledby="desktop-daily-backup-title">
      <h2 id="desktop-daily-backup-title">{t(locale, 'app.desktopRead.backupTitle')}</h2>
      {days.length === 0 ? <p>{t(locale, 'app.desktopRead.backupEmpty')}</p> : null}
      <ul>
        {days.map((day) => (
          <li key={day}>
            <span>{day}</span>
            <button type="button" onClick={() => setPending(day)}>
              {t(locale, 'app.desktopRead.backupRestore')}
            </button>
          </li>
        ))}
      </ul>
      {restoredPath === null ? null : (
        <p>{tf(locale, 'app.desktopRead.backupRestored', { path: restoredPath })}</p>
      )}
      {errorKey === null ? null : <p role="alert">{t(locale, errorKey)}</p>}
      {pending === null ? null : (
        <div role="dialog" aria-labelledby="desktop-daily-backup-confirm">
          <h2 id="desktop-daily-backup-confirm">
            {t(locale, 'app.desktopRead.backupConfirmTitle')}
          </h2>
          <p>{t(locale, 'app.desktopRead.backupConfirmBody')}</p>
          <button type="button" onClick={() => setPending(null)}>
            {t(locale, 'app.desktopRead.backupCancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              const day = pending;
              setPending(null);
              void restoreDailyBackup(sessionId, day)
                .then((result) => {
                  if ('cancelled' in result) return;
                  setErrorKey(null);
                  setRestoredPath(result.folder);
                })
                .catch((error: unknown) => {
                  setRestoredPath(null);
                  setErrorKey(backupErrorKey(error));
                });
            }}
          >
            {t(locale, 'app.desktopRead.backupConfirm')}
          </button>
        </div>
      )}
    </section>
  );
}

function backupErrorKey(
  error: unknown,
): 'app.desktopRead.backupOccupied' | 'app.desktopRead.backupFailed' {
  if (error instanceof Error && error.message === 'import destination is not empty') {
    return 'app.desktopRead.backupOccupied';
  }
  return 'app.desktopRead.backupFailed';
}
