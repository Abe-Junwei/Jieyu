import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentNoteCategory } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import '../styles/pages/desktop-project-read.css';

const CATEGORIES = [
  'comment',
  'question',
  'todo',
  'linguistic',
  'fieldwork',
  'correction',
  'topic',
] as const satisfies readonly ContentNoteCategory[];

export function DesktopAnnotationPage({ host }: { host: DesktopReadHost }) {
  const locale = useLocale();
  const read = useDesktopProjectReadController(host, false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<ContentNoteCategory>('comment');
  const [body, setBody] = useState('');
  const selected = read.model?.units.find((unit) => unit.id === selectedId);

  return (
    <section className="desktop-project-read">
      <h1>{t(locale, 'workspace.annotation.title')}</h1>
      {read.sessionId === null ? (
        <Link to="/desktop-project">{t(locale, 'app.desktopRead.openFolder')}</Link>
      ) : null}
      {read.error ? <p role="alert">{read.error}</p> : null}
      {read.model === null && read.sessionId !== null && !read.error ? (
        <p>{t(locale, 'workspace.annotation.loading')}</p>
      ) : null}
      {read.model === null ? null : (
        <>
          <div className="desktop-project-read-manuscripts">
            {read.model.manuscripts.map((manuscript) => (
              <button
                key={manuscript.id}
                type="button"
                aria-current={manuscript.id === read.model?.manuscriptId ? 'true' : 'false'}
                onClick={() => {
                  setSelectedId(null);
                  read.selectManuscript(manuscript.id);
                }}
              >
                {manuscript.title[locale] ?? Object.values(manuscript.title)[0] ?? manuscript.id}
              </button>
            ))}
          </div>
          <div className="desktop-project-read-units">
            {read.model.units.map((unit) => (
              <button
                key={unit.id}
                type="button"
                aria-pressed={unit.id === selectedId}
                onClick={() => setSelectedId(unit.id)}
              >
                {`${unit.startTime.toFixed(1)}–${unit.endTime.toFixed(1)} ${unit.text}`}
              </button>
            ))}
          </div>
          {read.model.units.length === 0 ? (
            <p>{t(locale, 'workspace.annotation.emptyList')}</p>
          ) : null}
          {selected === undefined ? null : (
            <div className="desktop-project-read-units">
              <p>{selected.text}</p>
              <ul>
                {read.notes
                  .filter((note) => note.unitId === selected.id && note.view === null)
                  .map((note) => (
                    <li key={note.id}>
                      {note.category === null
                        ? null
                        : `${t(locale, `workspace.annotation.noteCategory.${note.category}`)}: `}
                      {note.text}
                    </li>
                  ))}
              </ul>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void read.saveCategorizedUnitNote(selected.id, body, category).then((saved) => {
                    if (saved) setBody('');
                  });
                }}
              >
                <label>
                  {t(locale, 'workspace.annotation.tagLabel')}
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as ContentNoteCategory)}
                  >
                    {CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {t(locale, `workspace.annotation.noteCategory.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t(locale, 'app.desktopRead.note')}
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} />
                </label>
                <button type="submit" disabled={body.trim().length === 0}>
                  {t(locale, 'app.desktopRead.saveNote')}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
