import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { tf, t, useLocale } from '../i18n';

type AttachmentRow = { id: string; displayName: string; mimeType: string };

type AttachmentProps = {
  sessionId: string;
  lexemeId: string;
  desktopCall: DesktopReadHost['desktopCall'];
};

export function DesktopLexiconAttachments(props: AttachmentProps) {
  return <EntryAttachments key={JSON.stringify([props.sessionId, props.lexemeId])} {...props} />;
}

function EntryAttachments(props: AttachmentProps) {
  const locale = useLocale();
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [error, setError] = useState(false);
  const [opened, setOpened] = useState<{ url: string; mime: string; name: string } | null>(null);
  const openRequest = useRef(0);
  const [openFailed, setOpenFailed] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removal, setRemoval] = useState<'unknown' | 'removed' | null>(null);
  const [revision, setRevision] = useState(0);
  const removingRef = useRef(false);
  const { sessionId, lexemeId, desktopCall } = props;

  useEffect(() => {
    setPendingId(null);
    setRemoval(null);
  }, [lexemeId, sessionId]);

  useEffect(() => {
    let cancelled = false;
    setOpened(null);
    setOpenFailed(false);
    void createDesktopClient({ desktopCall })
      .listAttachments(sessionId, lexemeId)
      .then((listed) => {
        if (!cancelled) {
          setRows(
            listed.map((row) => ({
              id: row.id,
              displayName: row.displayName,
              mimeType: row.mimeType,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopCall, lexemeId, revision, sessionId]);

  useEffect(
    () => () => {
      openRequest.current += 1;
    },
    [],
  );
  useEffect(
    () => () => {
      if (opened !== null) URL.revokeObjectURL(opened.url);
    },
    [opened],
  );

  const open = (row: AttachmentRow) => {
    const request = ++openRequest.current;
    setError(false);
    setOpenFailed(false);
    setOpened(null);
    void createDesktopClient({ desktopCall })
      .readAttachment(sessionId, row.id)
      .then((read) => {
        if (request !== openRequest.current) return;
        const url = URL.createObjectURL(
          new Blob([Uint8Array.from(read.bytes)], { type: read.mimeType }),
        );
        setOpened({ url, mime: read.mimeType, name: row.displayName });
      })
      .catch(() => {
        if (request !== openRequest.current) return;
        setOpened(null);
        setOpenFailed(true);
      });
  };

  const confirmRemove = () => {
    if (pendingId === null || removingRef.current) return;
    const linkId = pendingId;
    removingRef.current = true;
    setRemoving(true);
    setError(false);
    const client = createDesktopClient({ desktopCall });
    void client
      .removeAttachmentLink(sessionId, linkId)
      .then((result) => {
        if (result.state !== 'cleanup_pending') return null;
        return client.finishAttachmentCleanup(sessionId, result.fileId);
      })
      .then((finished) => {
        setPendingId(null);
        if (finished?.state === 'cleanup_unknown') setRemoval('unknown');
        else if (finished?.state === 'removed') setRemoval('removed');
        else setRemoval(null);
        setRevision((current) => current + 1);
      })
      .catch(() => {
        setPendingId(null);
        setRemoval(null);
        setError(true);
      })
      .finally(() => {
        removingRef.current = false;
        setRemoving(false);
      });
  };

  const publish = (file: File | undefined) => {
    if (file === undefined || file.size === 0) return;
    setError(false);
    void file
      .arrayBuffer()
      .then((buffer) =>
        createDesktopClient({ desktopCall }).publishAttachment(sessionId, {
          lexemeId,
          displayName: file.name,
          kind: attachmentKind(file.type),
          mimeType: file.type.length > 0 ? file.type : 'application/octet-stream',
          bytes: new Uint8Array(buffer),
          operationId: crypto.randomUUID(),
        }),
      )
      .then(() => setRevision((current) => current + 1))
      .catch(() => setError(true));
  };

  return (
    <section aria-label={t(locale, 'workspace.lexicon.attachments.title')}>
      <h2>{t(locale, 'workspace.lexicon.attachments.title')}</h2>
      {error ? (
        <p role="alert">{t(locale, 'workspace.lexicon.attachments.error.generic')}</p>
      ) : null}
      {openFailed ? (
        <p role="alert">{t(locale, 'workspace.lexicon.attachments.openFailed')}</p>
      ) : null}
      {opened === null ? null : (
        <div>
          <p>{tf(locale, 'workspace.lexicon.attachments.opened', { mime: opened.mime })}</p>
          {opened.mime.startsWith('image/') ? (
            <img
              src={opened.url}
              alt={opened.name}
              onError={() => {
                setOpened(null);
                setOpenFailed(true);
              }}
            />
          ) : null}
          {opened.mime.startsWith('audio/') ? (
            <audio
              src={opened.url}
              controls
              aria-label={opened.name}
              onError={() => {
                setOpened(null);
                setOpenFailed(true);
              }}
            />
          ) : null}
          <a href={opened.url} download={opened.name}>
            {opened.name}
          </a>
        </div>
      )}
      {removal === 'unknown' ? (
        <p role="alert">{t(locale, 'workspace.lexicon.attachments.removeUnknown')}</p>
      ) : null}
      {removal === 'removed' ? (
        <p>{t(locale, 'workspace.lexicon.attachments.removeRemoved')}</p>
      ) : null}
      {rows.length === 0 ? <p>{t(locale, 'workspace.lexicon.attachments.empty')}</p> : null}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span>{row.displayName}</span>
            <button type="button" onClick={() => open(row)}>
              {t(locale, 'workspace.lexicon.attachments.open')}
            </button>
            <button
              type="button"
              disabled={pendingId !== null || removing}
              onClick={() => {
                setError(false);
                setPendingId(row.id);
              }}
            >
              {t(locale, 'workspace.lexicon.attachments.remove')}
            </button>
          </li>
        ))}
      </ul>
      <input
        aria-label={t(locale, 'workspace.lexicon.attachments.fileLabel')}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          publish(file);
          event.currentTarget.value = '';
        }}
      />
      {pendingId === null ? null : (
        <div role="dialog" aria-labelledby="desktop-attachment-remove-confirm">
          <h2 id="desktop-attachment-remove-confirm">
            {t(locale, 'workspace.lexicon.attachments.removeConfirmTitle')}
          </h2>
          <button
            type="button"
            disabled={removing}
            onClick={() => {
              setPendingId(null);
            }}
          >
            {t(locale, 'workspace.lexicon.attachments.removeCancel')}
          </button>
          <button type="button" disabled={removing} onClick={confirmRemove}>
            {t(locale, 'workspace.lexicon.attachments.removeConfirm')}
          </button>
        </div>
      )}
    </section>
  );
}

function attachmentKind(mime: string): 'image' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
