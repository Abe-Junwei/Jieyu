import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t, useLocale } from '../i18n';
import {
  addAnnotationAbbreviation,
  listAnnotationAbbreviations,
  removeAnnotationAbbreviation,
  renameAnnotationAbbreviation,
  type AnnotationAbbreviation,
} from '../services/annotationAbbreviationStore';
import {
  getActiveProjectTextId,
  subscribeActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';

export function AnnotationTemplateAbbreviations() {
  const locale = useLocale();
  const [params] = useSearchParams();
  const textId = useSyncExternalStore(subscribeActiveProjectTextId, getActiveProjectTextId);
  const sectionRef = useRef<HTMLElement>(null);
  const [rows, setRows] = useState<AnnotationAbbreviation[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!textId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void listAnnotationAbbreviations(textId)
      .then((loaded) => {
        if (!cancelled) {
          setRows(loaded);
          setError('');
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t(locale, 'workspace.structuralProfile.abbreviationLoadError'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [locale, textId]);

  useEffect(() => {
    if (params.get('section') !== 'abbreviations') return;
    const abbr = params.get('abbr')?.trim().toUpperCase() ?? '';
    if (abbr) setCode(abbr);
    sectionRef.current?.scrollIntoView({ block: 'start' });
  }, [params]);

  const reload = () => {
    if (!textId) return;
    void listAnnotationAbbreviations(textId).then(setRows);
  };

  return (
    <section
      ref={sectionRef}
      className="annotation-template-abbreviations la-panel-section"
      aria-label={t(locale, 'workspace.structuralProfile.abbreviationsTitle')}
    >
      <h2 className="lm-section-title">
        {t(locale, 'workspace.structuralProfile.abbreviationsTitle')}
      </h2>
      {!textId ? (
        <p className="lm-state">
          {t(locale, 'workspace.structuralProfile.abbreviationNeedsProject')}
        </p>
      ) : null}
      {error ? <p className="lm-state">{error}</p> : null}
      <ul className="annotation-template-abbreviation-list">
        {rows.map((row) => (
          <li key={row.abbreviation} className="annotation-template-abbreviation-row">
            <input
              className="input"
              aria-label={t(locale, 'workspace.structuralProfile.abbreviationName')}
              defaultValue={row.name}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (!textId || !next || next === row.name) return;
                void renameAnnotationAbbreviation(textId, row.abbreviation, next).then(reload);
              }}
            />
            <span className="annotation-template-abbreviation-code">{row.abbreviation}</span>
            {row.leipzig ? (
              <span className="annotation-template-abbreviation-badge">
                {t(locale, 'workspace.structuralProfile.abbreviationLeipzig')}
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-quiet"
              aria-label={t(locale, 'workspace.structuralProfile.abbreviationRemove')}
              onClick={() => {
                if (!textId) return;
                void removeAnnotationAbbreviation(textId, row.abbreviation).then(reload);
              }}
            >
              {t(locale, 'workspace.structuralProfile.abbreviationRemove')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="annotation-template-abbreviation-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!textId) return;
          void addAnnotationAbbreviation(textId, code, name || code).then((result) => {
            if (result === 'duplicate') {
              setError(t(locale, 'workspace.structuralProfile.abbreviationDuplicate'));
              return;
            }
            if (result === 'empty') return;
            setCode('');
            setName('');
            setError('');
            reload();
          });
        }}
      >
        <input
          className="input"
          aria-label={t(locale, 'workspace.structuralProfile.abbreviationName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="input"
          aria-label={t(locale, 'workspace.structuralProfile.abbreviationCode')}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <button type="submit" className="btn btn-primary" disabled={!textId}>
          {t(locale, 'workspace.structuralProfile.abbreviationAdd')}
        </button>
      </form>
    </section>
  );
}
