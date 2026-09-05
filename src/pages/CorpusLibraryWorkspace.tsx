import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { t, tf, useLocale } from '../i18n';
import { useCorpusLibraryController } from './useCorpusLibraryController';

export function CorpusLibraryWorkspace() {
  const locale = useLocale();
  const controller = useCorpusLibraryController();

  const sidePaneContent = useMemo(
    () => (
      <div className="app-side-pane-feature-stack">
        <section
          className="app-side-pane-group"
          aria-label={t(locale, 'workspace.corpus.sidePaneCurrent')}
        >
          <div
            className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
            role="presentation"
          >
            <span className="app-side-pane-section-title">
              {t(locale, 'workspace.corpus.sidePaneCurrent')}
            </span>
          </div>
          <div className="app-side-pane-nav app-side-pane-feature-nav">
            <span className="app-side-pane-feature-badge">
              {t(locale, 'workspace.corpus.badge')}
            </span>
            <p className="app-side-pane-feature-summary">
              {controller.isEmpty
                ? t(locale, 'workspace.corpus.empty')
                : tf(locale, 'workspace.corpus.unitCount', { count: controller.unitCount })}
            </p>
            <p className="app-side-pane-feature-summary">
              {tf(locale, 'workspace.corpus.basketCount', { count: controller.basketCount })}
            </p>
            <Link className="app-side-pane-feature-link" to={controller.transcriptionHref}>
              {t(locale, 'workspace.corpus.openTranscription')}
            </Link>
          </div>
        </section>
      </div>
    ),
    [
      controller.basketCount,
      controller.isEmpty,
      controller.transcriptionHref,
      controller.unitCount,
      locale,
    ],
  );

  useRegisterAppSidePane({
    title: t(locale, 'workspace.corpus.sidePaneTitle'),
    subtitle: t(locale, 'workspace.corpus.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section
      className="panel corpus-library-workspace"
      data-testid="corpus-library-workspace"
      aria-labelledby="corpus-library-title"
    >
      <header className="corpus-library-hero">
        <span className="corpus-library-badge">{t(locale, 'workspace.corpus.badge')}</span>
        <h2 id="corpus-library-title">{t(locale, 'workspace.corpus.title')}</h2>
        <p className="corpus-library-summary">{t(locale, 'workspace.corpus.summary')}</p>
        <Link className="corpus-library-return" to={controller.transcriptionHref}>
          {t(locale, 'workspace.corpus.openTranscription')}
        </Link>
      </header>

      {controller.isEmpty ? (
        <p className="corpus-library-empty">{t(locale, 'workspace.corpus.empty')}</p>
      ) : controller.isLoading ? (
        <p className="corpus-library-empty">{t(locale, 'workspace.corpus.loading')}</p>
      ) : controller.loadError.length > 0 ? (
        <p className="corpus-library-empty">
          {t(locale, 'workspace.corpus.errorPrefix')} {controller.loadError}
        </p>
      ) : (
        <div className="corpus-library-body">
          <label className="corpus-library-filter">
            <span className="corpus-library-filter-label">
              {t(locale, 'workspace.corpus.filterLabel')}
            </span>
            <input
              type="search"
              value={controller.filterText}
              onChange={(event) => controller.onFilterChange(event.target.value)}
              placeholder={t(locale, 'workspace.corpus.filterPlaceholder')}
            />
          </label>
          {controller.rows.length === 0 ? (
            <p className="corpus-library-empty">{t(locale, 'workspace.corpus.emptyFilter')}</p>
          ) : (
            <ul className="corpus-library-list">
              {controller.rows.map((row) => (
                <li
                  key={row.id}
                  className={
                    row.selected
                      ? 'corpus-library-row corpus-library-row-selected'
                      : 'corpus-library-row'
                  }
                  data-testid={`corpus-library-unit-${row.id}`}
                >
                  <input
                    id={`corpus-library-select-${row.id}`}
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => controller.onToggleUnit(row.id)}
                    aria-label={t(locale, 'workspace.corpus.selectUnit')}
                  />
                  <label
                    className="corpus-library-row-main"
                    htmlFor={`corpus-library-select-${row.id}`}
                  >
                    <span className="corpus-library-row-text">
                      {row.text.length > 0 ? row.text : row.id}
                    </span>
                    <span className="corpus-library-row-time">{row.timeLabel}</span>
                  </label>
                  <Link className="corpus-library-row-link" to={row.transcriptionHref}>
                    {t(locale, 'workspace.corpus.openInTranscription')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
