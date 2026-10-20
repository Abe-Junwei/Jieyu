import { useEffect, useState, useSyncExternalStore } from 'react';
import { t, useLocale } from '../i18n';
import {
  addAnnotationPosCategory,
  listAnnotationPosCategories,
  removeAnnotationPosCategory,
  renameAnnotationPosCategory,
  type AnnotationPosCategory,
} from '../app/languageAssetPageAccess';
import {
  getActiveProjectTextId,
  subscribeActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
import { fireAndForget } from '../utils/fireAndForget';

export function AnnotationTemplatePosCategories() {
  const locale = useLocale();
  const textId = useSyncExternalStore(subscribeActiveProjectTextId, getActiveProjectTextId);
  const [rows, setRows] = useState<AnnotationPosCategory[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!textId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void listAnnotationPosCategories(textId)
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
            : t(locale, 'workspace.structuralProfile.posLoadError'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [locale, textId]);

  const reload = () => {
    if (!textId) return;
    fireAndForget(listAnnotationPosCategories(textId).then(setRows), {
      context: 'src/components/AnnotationTemplatePosCategories.tsx:L52',
      policy: 'user-visible',
    });
  };

  return (
    <section
      className="annotation-template-abbreviations la-panel-section"
      aria-label={t(locale, 'workspace.structuralProfile.posTitle')}
    >
      <h2 className="lm-section-title">{t(locale, 'workspace.structuralProfile.posTitle')}</h2>
      {!textId ? (
        <p className="lm-state">{t(locale, 'workspace.structuralProfile.posNeedsProject')}</p>
      ) : null}
      {error ? <p className="lm-state">{error}</p> : null}
      <ul className="annotation-template-abbreviation-list">
        {rows.map((row) => (
          <li key={row.abbreviation} className="annotation-template-abbreviation-row">
            <input
              className="input"
              aria-label={t(locale, 'workspace.structuralProfile.posName')}
              defaultValue={row.name}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (!textId || !next || next === row.name) return;
                fireAndForget(
                  renameAnnotationPosCategory(textId, row.abbreviation, next).then(reload),
                  {
                    context: 'src/components/AnnotationTemplatePosCategories.tsx:L78',
                    policy: 'user-visible',
                  },
                );
              }}
            />
            <span className="annotation-template-abbreviation-code">{row.abbreviation}</span>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                if (!textId) return;
                fireAndForget(removeAnnotationPosCategory(textId, row.abbreviation).then(reload), {
                  context: 'src/components/AnnotationTemplatePosCategories.tsx:L93',
                  policy: 'user-visible',
                });
              }}
            >
              {t(locale, 'workspace.structuralProfile.posRemove')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="annotation-template-abbreviation-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!textId) return;
          fireAndForget(
            addAnnotationPosCategory(textId, code, name || code).then((result) => {
              if (result === 'duplicate') {
                setError(t(locale, 'workspace.structuralProfile.posDuplicate'));
                return;
              }
              if (result === 'empty') return;
              setCode('');
              setName('');
              setError('');
              reload();
            }),
            {
              context: 'src/components/AnnotationTemplatePosCategories.tsx:L109',
              policy: 'user-visible',
            },
          );
        }}
      >
        <input
          className="input"
          aria-label={t(locale, 'workspace.structuralProfile.posName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="input"
          aria-label={t(locale, 'workspace.structuralProfile.posCode')}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <button type="submit" className="btn btn-primary" disabled={!textId}>
          {t(locale, 'workspace.structuralProfile.posAdd')}
        </button>
      </form>
    </section>
  );
}
