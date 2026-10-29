import { useEffect, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function DesktopLexiconAttachments(props: {
  sessionId: string;
  lexemeId: string;
  desktopCall: DesktopReadHost['desktopCall'];
}) {
  const locale = useLocale();
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const { sessionId, lexemeId, desktopCall } = props;

  useEffect(() => {
    let cancelled = false;
    void createDesktopClient({ desktopCall })
      .listAttachments(sessionId, lexemeId)
      .then((rows) => {
        if (!cancelled) setNames(rows.map((row) => row.displayName));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopCall, lexemeId, revision, sessionId]);

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
      {names.length === 0 ? <p>{t(locale, 'workspace.lexicon.attachments.empty')}</p> : null}
      <ul>
        {names.map((name) => (
          <li key={name}>{name}</li>
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
    </section>
  );
}

function attachmentKind(mime: string): 'image' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
