import { useEffect, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function DesktopAnchoredNoteField(props: {
  sessionId: string;
  unitId: string;
  targetId: string;
  kind: 'token' | 'morpheme';
  form: string;
  desktopCall: DesktopReadHost['desktopCall'];
}) {
  const locale = useLocale();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const { sessionId, unitId, targetId, kind, form, desktopCall } = props;
  const label =
    kind === 'token'
      ? t(locale, 'app.desktopRead.wordNote')
      : t(locale, 'app.desktopRead.morphemeNote');
  const saveLabel =
    kind === 'token'
      ? t(locale, 'app.desktopRead.saveWordNote')
      : t(locale, 'app.desktopRead.saveMorphemeNote');

  useEffect(() => {
    let cancelled = false;
    void createDesktopClient({ desktopCall })
      .listNotes(sessionId, { anchorKind: kind, unitId, attachment: 'active' })
      .then((notes) => {
        if (cancelled) return;
        setSaved(
          notes
            .filter((note) =>
              kind === 'token' ? note.tokenId === targetId : note.morphemeId === targetId,
            )
            .map((note) => note.content.default ?? '')
            .filter((text) => text.length > 0),
        );
      })
      .catch(() => {
        if (!cancelled) setSaved([]);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopCall, kind, sessionId, targetId, unitId]);

  const save = () => {
    const body = draft.trim();
    if (body.length === 0) return;
    const anchor =
      kind === 'token'
        ? { kind: 'token' as const, unitId, tokenId: targetId }
        : { kind: 'morpheme' as const, unitId, morphemeId: targetId };
    void createDesktopClient({ desktopCall })
      .createNote(sessionId, { anchor, content: { default: body } })
      .then(() => {
        setSaved((current) => [...current, body]);
        setDraft('');
      })
      .catch(() => undefined);
  };

  return (
    <span>
      {saved.map((text) => (
        <span key={text}>{text}</span>
      ))}
      <input
        aria-label={`${label}: ${form}`}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
      <button type="button" onClick={save}>
        {`${saveLabel}: ${form}`}
      </button>
    </span>
  );
}
