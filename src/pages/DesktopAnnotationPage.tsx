import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentNoteCategory } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { useDesktopAnnotationWords } from './useDesktopAnnotationWords';
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
  const words = useDesktopAnnotationWords(host, read.sessionId, selectedId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<ContentNoteCategory>('comment');
  const [body, setBody] = useState('');
  const selected = read.model?.units.find((unit) => unit.id === selectedId);

  return (
    <section className="desktop-project-read">
      <h1>{t(locale, 'workspace.annotation.title')}</h1>
      {read.sessionId === null ? (
        <Link to="/desktop-project">{t(locale, 'app.desktopRead.openFolder')}</Link>
      ) : null}
      {read.error || words.error ? <p role="alert">{read.error || words.error}</p> : null}
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
                  setEditingId(null);
                  setBody('');
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
                onClick={() => {
                  setSelectedId(unit.id);
                  setEditingId(null);
                  setBody('');
                }}
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
                {words.words.map((word) => (
                  <li key={word.id}>
                    <span>{word.form}</span>
                    <input
                      aria-label={`${t(locale, 'workspace.annotation.glossLabel')}: ${word.form}`}
                      defaultValue={word.gloss[words.glossKey] ?? ''}
                      onBlur={(event) => {
                        words.setGloss(word.id, event.currentTarget.value.trim());
                      }}
                    />
                    <input
                      aria-label={`${t(locale, 'workspace.annotation.posLabel')}: ${word.form}`}
                      defaultValue={word.pos}
                      onBlur={(event) => {
                        words.setPos(word.id, event.currentTarget.value.trim());
                      }}
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={words.words.length > 0}
                onClick={() => words.segment()}
              >
                {t(locale, 'workspace.annotation.segmentWords')}
              </button>
              <ul>
                {words.morphemes.map((morpheme) => (
                  <li key={morpheme.id}>{morpheme.form}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={words.words.length === 0 || words.morphemes.length > 0}
                onClick={() => words.segmentMorphemes()}
              >
                {t(locale, 'workspace.annotation.morphemeSeed')}
              </button>
              <ul>
                {read.notes
                  .filter((note) => note.unitId === selected.id && note.view === null)
                  .map((note) => (
                    <li key={note.id}>
                      <span>
                        {note.category === null
                          ? null
                          : `${t(locale, `workspace.annotation.noteCategory.${note.category}`)}: `}
                        {note.text}
                      </span>
                      <button
                        type="button"
                        aria-label={`${t(locale, 'msg.notePanel.editNote')}: ${note.text}`}
                        onClick={() => {
                          setEditingId(note.id);
                          setBody(note.text);
                          setCategory(note.category ?? 'comment');
                        }}
                      >
                        {t(locale, 'msg.notePanel.editNote')}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t(locale, 'msg.notePanel.deleteNote')}: ${note.text}`}
                        onClick={() => {
                          void read.deleteUnitNote(note.id).then((deleted) => {
                            if (!deleted || editingId !== note.id) return;
                            setEditingId(null);
                            setBody('');
                          });
                        }}
                      >
                        {t(locale, 'msg.notePanel.deleteNote')}
                      </button>
                    </li>
                  ))}
              </ul>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const saving =
                    editingId === null
                      ? read.saveCategorizedUnitNote(selected.id, body, category)
                      : read.updateCategorizedUnitNote(editingId, body, category);
                  void saving.then((saved) => {
                    if (!saved) return;
                    setBody('');
                    setEditingId(null);
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
                {editingId === null ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setBody('');
                    }}
                  >
                    {t(locale, 'msg.notePanel.cancel')}
                  </button>
                )}
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
