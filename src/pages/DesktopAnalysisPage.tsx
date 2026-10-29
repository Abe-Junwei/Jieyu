import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, tf, useLocale } from '../i18n';
import { useDesktopAnalysisReview } from './useDesktopAnalysisReview';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import '../styles/pages/desktop-project-read.css';

export function DesktopAnalysisPage({ host }: { host: DesktopReadHost }) {
  const locale = useLocale();
  const read = useDesktopProjectReadController(host, false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const review = useDesktopAnalysisReview(host, read.sessionId, selectedId);
  const selected = read.model?.units.find((unit) => unit.id === selectedId);

  return (
    <section className="desktop-project-read">
      <h1>{t(locale, 'workspace.analysis.title')}</h1>
      {read.sessionId === null ? (
        <Link to="/desktop-project">{t(locale, 'app.desktopRead.openFolder')}</Link>
      ) : null}
      {read.error || review.error ? <p role="alert">{read.error || review.error}</p> : null}
      {read.model === null && read.sessionId !== null && !read.error ? (
        <p>{t(locale, 'workspace.analysis.loading')}</p>
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
                onClick={() => {
                  setSelectedId(unit.id);
                }}
              >
                {`${unit.startTime.toFixed(1)}–${unit.endTime.toFixed(1)} ${unit.text}`}
              </button>
            ))}
          </div>
          {read.model.units.length === 0 ? (
            <p>{t(locale, 'workspace.analysis.emptyUnits')}</p>
          ) : null}
          {selected === undefined || review.view === null ? null : (
            <div className="desktop-project-read-units">
              <p>
                {review.view.labels.length === 0
                  ? t(locale, 'workspace.analysis.noGraph')
                  : tf(locale, 'workspace.analysis.currentLabels', {
                      labels: review.view.labels.join(' '),
                    })}
              </p>
              {review.candidates.length === 0 ? (
                <p>{t(locale, 'workspace.analysis.emptyCandidates')}</p>
              ) : null}
              {review.candidates.map((candidate) => {
                const name = `${t(
                  locale,
                  candidate.action === 'accept'
                    ? 'workspace.analysis.accept'
                    : 'workspace.analysis.restore',
                )}: ${candidate.label}`;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      if (candidate.action === 'accept') review.accept(candidate.id);
                      else review.restore(candidate.id);
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
