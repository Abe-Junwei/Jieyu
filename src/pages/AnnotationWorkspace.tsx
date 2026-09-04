import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { t, tf, useLocale } from '../i18n';
import { AnnotationIgtRowView } from './annotation/AnnotationIgtRow';
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

  const saveStatusText =
    controller.saveNotice.kind === 'saving'
      ? t(locale, 'workspace.annotation.saving')
      : controller.saveNotice.kind === 'saved'
        ? t(locale, 'workspace.annotation.saveSaved')
        : controller.saveNotice.kind === 'error'
          ? tf(locale, 'workspace.annotation.saveFailed', {
              message: controller.saveNotice.message,
            })
          : t(locale, 'workspace.annotation.keyboardHint');

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
            data-save={controller.saveNotice.kind}
          >
            {saveStatusText}
          </p>
          <ul className="annotation-igt-list">
            {controller.rows.map((row) => (
              <AnnotationIgtRowView
                key={row.id}
                row={row}
                focused={row.id === controller.focusedUnitId}
                inputFocused={controller.keyboardMode === 'inputFocused'}
                drafts={controller.drafts}
                onFocusRow={controller.onFocusRow}
                onFocusInput={controller.onFocusInput}
                onTokenDraftChange={controller.onTokenDraftChange}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
