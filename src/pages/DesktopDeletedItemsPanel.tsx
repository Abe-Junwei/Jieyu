import { useEffect, useRef, useState } from 'react';
import {
  createDesktopClient,
  type DeletedMedia,
  type Manuscript,
} from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { tf, t, useLocale } from '../i18n';

export function DesktopDeletedItemsPanel(props: {
  sessionId: string;
  desktopCall: DesktopReadHost['desktopCall'];
  onRestored: () => void;
  reloadToken?: number;
}) {
  const { sessionId, desktopCall, onRestored } = props;
  const locale = useLocale();
  const liveSession = useRef(sessionId);
  const restoringRef = useRef(false);
  liveSession.current = sessionId;
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [recordings, setRecordings] = useState<DeletedMedia[]>([]);
  const [listFailed, setListFailed] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoredTitle, setRestoredTitle] = useState<string | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setRestoredTitle(null);
    setRestoreFailed(false);
  }, [sessionId]);

  useEffect(() => {
    let current = true;
    setListFailed(false);
    const client = createDesktopClient({ desktopCall });
    void Promise.all([client.listDeletedManuscripts(sessionId), client.listDeletedMedia(sessionId)])
      .then(([nextManuscripts, nextRecordings]) => {
        if (!current) return;
        setManuscripts(nextManuscripts);
        setRecordings(nextRecordings);
      })
      .catch(() => {
        if (current) setListFailed(true);
      });
    return () => {
      current = false;
    };
  }, [desktopCall, props.reloadToken, revision, sessionId]);

  const restore = (id: string, title: string) => {
    if (restoringRef.current) return;
    const seen = sessionId;
    restoringRef.current = true;
    setRestoringId(id);
    setRestoreFailed(false);
    void createDesktopClient({ desktopCall })
      .restoreManuscript(sessionId, id)
      .then(() => {
        if (liveSession.current !== seen) return;
        setRestoredTitle(title);
        setRevision((current) => current + 1);
        onRestored();
      })
      .catch(() => {
        if (liveSession.current !== seen) return;
        setRestoreFailed(true);
      })
      .finally(() => {
        restoringRef.current = false;
        if (liveSession.current === seen) setRestoringId(null);
      });
  };

  return (
    <section aria-labelledby="desktop-deleted-items-title">
      <h2 id="desktop-deleted-items-title">{t(locale, 'app.desktopRead.deletedTitle')}</h2>
      {listFailed ? <p role="alert">{t(locale, 'app.desktopRead.deletedListFailed')}</p> : null}
      {!listFailed && manuscripts.length === 0 && recordings.length === 0 ? (
        <p>{t(locale, 'app.desktopRead.deletedEmpty')}</p>
      ) : null}
      {restoredTitle === null ? null : (
        <p>{tf(locale, 'app.desktopRead.deletedRestored', { title: restoredTitle })}</p>
      )}
      {restoreFailed ? (
        <p role="alert">{t(locale, 'app.desktopRead.deletedRestoreFailed')}</p>
      ) : null}
      <ul>
        {manuscripts.map((manuscript) => {
          const title = deletedTitle(manuscript.title, manuscript.id);
          return (
            <li key={manuscript.id}>
              <span>
                {tf(locale, 'app.desktopRead.deletedManuscript', {
                  title,
                  until: manuscript.retainUntil ?? '',
                })}
              </span>
              <button
                type="button"
                disabled={restoringId !== null}
                onClick={() => restore(manuscript.id, title)}
              >
                {t(locale, 'app.desktopRead.deletedRestore')}
              </button>
            </li>
          );
        })}
        {recordings.map((recording) => (
          <li key={recording.id}>
            {tf(locale, 'app.desktopRead.deletedRecording', {
              path: recording.relpath,
              until: recording.retainUntil,
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function deletedTitle(title: Record<string, string>, id: string): string {
  const candidates = [title.zh, title['zh-CN'], title.und, ...Object.values(title)];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return id;
}
