import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { filterDesktopLexemes } from './lexicon/desktopLexemeDraft';
import { useDesktopLexiconController } from './useDesktopLexiconController';
import '../styles/pages/desktop-project-read.css';

export function DesktopLexiconPage({ host }: { host: DesktopReadHost }) {
  const locale = useLocale();
  const lexicon = useDesktopLexiconController(host);
  const [query, setQuery] = useState('');
  const shown = filterDesktopLexemes(lexicon.entries, query);
  const editing = lexicon.creating || lexicon.selectedId.length > 0;

  return (
    <section className="desktop-project-read">
      <h1>{t(locale, 'workspace.lexicon.title')}</h1>
      {lexicon.sessionId === null ? (
        <Link to="/desktop-project">{t(locale, 'app.desktopRead.openFolder')}</Link>
      ) : null}
      {lexicon.error.length > 0 ? <p role="alert">{lexicon.error}</p> : null}
      <input
        aria-label={t(locale, 'workspace.lexicon.searchPlaceholder')}
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
      />
      {shown.length === 0 ? <p>{t(locale, 'workspace.lexicon.emptyList')}</p> : null}
      <ul>
        {shown.map((entry) => (
          <li key={entry.id}>
            <button type="button" onClick={() => lexicon.select(entry.id)}>
              {entry.headword}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={lexicon.beginCreate}>
        {t(locale, 'workspace.annotation.lexemeCreate')}
      </button>
      {editing ? (
        <>
          <input
            aria-label={t(locale, 'workspace.annotation.lexemeCreateHeadword')}
            value={lexicon.headword}
            onChange={(event) => {
              lexicon.setHeadword(event.currentTarget.value);
            }}
          />
          <input
            aria-label={t(locale, 'workspace.annotation.lexemeCreateTranslation')}
            value={lexicon.translation}
            onChange={(event) => {
              lexicon.setTranslation(event.currentTarget.value);
            }}
          />
          <button type="button" onClick={lexicon.save}>
            {lexicon.creating
              ? t(locale, 'workspace.annotation.lexemeCreateSubmit')
              : t(locale, 'workspace.lexicon.edit.save')}
          </button>
        </>
      ) : null}
    </section>
  );
}
