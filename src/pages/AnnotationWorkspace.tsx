import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { t, tf, useLocale } from '../i18n';
import { useAnnotationWorkspaceController } from './useAnnotationWorkspaceController';

export function AnnotationWorkspace() {
  const locale = useLocale();
  const controller = useAnnotationWorkspaceController();

  const sidePaneContent = useMemo(
    () => (
      <div className="app-side-pane-feature-stack">
        <section
          className="app-side-pane-group"
          aria-label={t(locale, 'workspace.annotation.sidePaneCurrent')}
        >
          <div
            className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
            role="presentation"
          >
            <span className="app-side-pane-section-title">
              {t(locale, 'workspace.annotation.sidePaneCurrent')}
            </span>
          </div>
          <div className="app-side-pane-nav app-side-pane-feature-nav">
            <span className="app-side-pane-feature-badge">
              {t(locale, 'workspace.annotation.badge')}
            </span>
            <p className="app-side-pane-feature-summary">
              {controller.isEmpty
                ? t(locale, 'workspace.annotation.empty')
                : tf(locale, 'workspace.annotation.unitCount', { count: controller.unitCount })}
            </p>
            <Link className="app-side-pane-feature-link" to={controller.transcriptionHref}>
              {t(locale, 'workspace.annotation.openTranscription')}
            </Link>
          </div>
        </section>
      </div>
    ),
    [controller.isEmpty, controller.transcriptionHref, controller.unitCount, locale],
  );

  useRegisterAppSidePane({
    title: t(locale, 'workspace.annotation.sidePaneTitle'),
    subtitle: t(locale, 'workspace.annotation.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section
      className="panel annotation-workspace"
      data-testid="annotation-workspace"
      aria-labelledby="annotation-workspace-title"
      tabIndex={0}
      onKeyDown={(event) => {
        controller.onKeyDown(event);
      }}
    >
      <header className="annotation-workspace-hero">
        <span className="annotation-workspace-badge">
          {t(locale, 'workspace.annotation.badge')}
        </span>
        <h2 id="annotation-workspace-title">{t(locale, 'workspace.annotation.title')}</h2>
        <p className="annotation-workspace-summary">{t(locale, 'workspace.annotation.summary')}</p>
        <Link className="annotation-workspace-return" to={controller.transcriptionHref}>
          {t(locale, 'workspace.annotation.openTranscription')}
        </Link>
      </header>

      {controller.isEmpty ? (
        <p className="annotation-workspace-empty">{t(locale, 'workspace.annotation.empty')}</p>
      ) : controller.isLoading ? (
        <p className="annotation-workspace-empty">{t(locale, 'workspace.annotation.loading')}</p>
      ) : controller.loadError.length > 0 ? (
        <p className="annotation-workspace-empty">
          {t(locale, 'workspace.annotation.errorPrefix')} {controller.loadError}
        </p>
      ) : controller.rows.length === 0 ? (
        <p className="annotation-workspace-empty">{t(locale, 'workspace.annotation.emptyList')}</p>
      ) : (
        <div className="annotation-workspace-body">
          <p
            className="annotation-workspace-keyboard"
            data-testid="annotation-keyboard-status"
            data-mode={controller.keyboardMode}
            data-action={controller.lastAction}
          >
            {t(locale, 'workspace.annotation.keyboardHint')}
          </p>
          <ul className="annotation-igt-list">
            {controller.rows.map((row) => (
              <li
                key={row.id}
                className={
                  row.id === controller.focusedUnitId
                    ? 'annotation-igt-row annotation-igt-row-focused'
                    : 'annotation-igt-row'
                }
                data-testid={`annotation-igt-row-${row.id}`}
                onClick={() => controller.onFocusRow(row.id)}
              >
                <div className="annotation-igt-meta">
                  <span className="annotation-igt-time">{row.timeLabel}</span>
                  <Link className="annotation-igt-link" to={row.transcriptionHref}>
                    {t(locale, 'workspace.annotation.openInTranscription')}
                  </Link>
                </div>
                <p className="annotation-igt-label">
                  {t(locale, 'workspace.annotation.surfaceLabel')}
                </p>
                <div className="annotation-igt-tokens">
                  {row.tokens.length > 0 ? (
                    row.tokens.map((token) => (
                      <span key={token.id} className="annotation-igt-stack">
                        <span className="annotation-igt-form">{token.form}</span>
                        <span className="annotation-igt-gloss">{token.gloss}</span>
                      </span>
                    ))
                  ) : (
                    <span className="annotation-igt-stack">
                      <span className="annotation-igt-form">
                        {row.surface.length > 0 ? row.surface : row.id}
                      </span>
                      <span className="annotation-igt-gloss"> </span>
                    </span>
                  )}
                </div>
                <p className="annotation-igt-label">
                  {t(locale, 'workspace.annotation.translationLabel')}
                </p>
                <p className="annotation-igt-translation">
                  {row.translation.length > 0
                    ? row.translation
                    : t(locale, 'workspace.annotation.translationEmpty')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
