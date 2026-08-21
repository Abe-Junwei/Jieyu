import '../styles/pages/feature-availability.css';
import '../styles/pages/analysis-workspace.css';
import '../styles/ai-sidebar-entry.css';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { t, tf, useLocale } from '../i18n';
import { buildTranscriptionWorkspaceReturnHref } from '../utils/transcriptionUrlDeepLink';
import { TranscriptionPageAnalysisRuntime } from './TranscriptionPage.AnalysisRuntime';
import { useAnalysisWorkspaceController } from './useAnalysisWorkspaceController';

export function AnalysisPage() {
  const locale = useLocale();
  const controller = useAnalysisWorkspaceController();
  const transcriptionHref = buildTranscriptionWorkspaceReturnHref();

  const sidePaneContent = useMemo(
    () => (
      <div className="app-side-pane-feature-stack">
        <section
          className="app-side-pane-group"
          aria-label={t(locale, 'workspace.analysis.sidePaneCurrent')}
        >
          <div
            className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
            role="presentation"
          >
            <span className="app-side-pane-section-title">
              {t(locale, 'workspace.analysis.sidePaneCurrent')}
            </span>
          </div>
          <div className="app-side-pane-nav app-side-pane-feature-nav">
            <span className="app-side-pane-feature-badge">
              {t(locale, 'workspace.analysis.badge')}
            </span>
            <p className="app-side-pane-feature-summary">
              {controller.isEmpty
                ? t(locale, 'workspace.analysis.empty')
                : tf(locale, 'workspace.analysis.unitCount', { count: controller.unitCount })}
            </p>
            <Link className="app-side-pane-feature-link" to={transcriptionHref}>
              {t(locale, 'workspace.analysis.openTranscription')}
            </Link>
          </div>
        </section>
      </div>
    ),
    [controller.isEmpty, controller.unitCount, locale, transcriptionHref],
  );

  useRegisterAppSidePane({
    title: t(locale, 'workspace.analysis.sidePaneTitle'),
    subtitle: t(locale, 'workspace.analysis.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section className="panel analysis-workspace" aria-labelledby="analysis-workspace-title">
      <header className="analysis-workspace-hero">
        <span className="analysis-workspace-badge">{t(locale, 'workspace.analysis.badge')}</span>
        <h2 id="analysis-workspace-title">{t(locale, 'workspace.analysis.title')}</h2>
        <p className="analysis-workspace-summary">{t(locale, 'workspace.analysis.summary')}</p>
        <Link className="analysis-workspace-return" to={transcriptionHref}>
          {t(locale, 'workspace.analysis.openTranscription')}
        </Link>
      </header>

      {controller.isEmpty ? (
        <p className="analysis-workspace-empty">{t(locale, 'workspace.analysis.empty')}</p>
      ) : controller.isLoading ? (
        <p className="analysis-workspace-empty">{t(locale, 'workspace.analysis.loading')}</p>
      ) : controller.loadError.length > 0 ? (
        <p className="analysis-workspace-empty">
          {t(locale, 'workspace.analysis.errorPrefix')} {controller.loadError}
        </p>
      ) : (
        <div className="analysis-workspace-body">
          <ErrorBoundary>
            <TranscriptionPageAnalysisRuntime {...controller.analysisRuntimeProps} />
          </ErrorBoundary>
        </div>
      )}
    </section>
  );
}
