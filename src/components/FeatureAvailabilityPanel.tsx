import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { t, useLocale } from '../i18n';

interface FeatureAvailabilityPanelProps {
  title: string;
  summary: string;
  scope: string[];
  sidePaneTitle?: string;
  sidePaneSubtitle?: string;
}

export function FeatureAvailabilityPanel({
  title,
  summary,
  scope,
  sidePaneTitle,
  sidePaneSubtitle,
}: FeatureAvailabilityPanelProps) {
  const locale = useLocale();

  const sidePaneContent = useMemo(() => (
    <div className="app-side-pane-feature-stack">
      <section className="app-side-pane-group" aria-label={t(locale, 'app.featureAvailability.currentStatus')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'app.featureAvailability.currentStatus')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav feature-availability-side-pane-nav">
          <span className="app-side-pane-feature-badge">{t(locale, 'app.featureAvailability.badgePlanned')}</span>
          <p className="app-side-pane-feature-summary">{summary}</p>
          <p className="app-side-pane-feature-note">{t(locale, 'app.featureAvailability.sidePaneNote')}</p>
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'app.featureAvailability.planned')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'app.featureAvailability.planned')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav feature-availability-side-pane-nav">
          {scope.map((item) => (
            <div key={item} className="app-side-pane-feature-item">{item}</div>
          ))}
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'app.featureAvailability.quickAccess')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'app.featureAvailability.quickAccess')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav feature-availability-side-pane-nav">
          <Link to="/transcription" className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'app.featureAvailability.backToTranscription')}</Link>
        </div>
      </section>
    </div>
  ), [locale, scope, summary]);

  useRegisterAppSidePane({
    title: sidePaneTitle ?? title,
    subtitle: sidePaneSubtitle ?? t(locale, 'app.featureAvailability.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section className="panel feature-availability-panel" aria-labelledby="feature-availability-title">
      <span className="feature-availability-badge">{t(locale, 'app.featureAvailability.badgePlanned')}</span>
      <h2 id="feature-availability-title">{title}</h2>
      <p className="feature-availability-summary">{summary}</p>
      <div className="feature-availability-block">
        <p className="feature-availability-label">{t(locale, 'app.featureAvailability.currentStatus')}</p>
        <p>{t(locale, 'app.featureAvailability.mainNote')}</p>
      </div>
      <div className="feature-availability-block">
        <p className="feature-availability-label">{t(locale, 'app.featureAvailability.planned')}</p>
        <ul className="feature-availability-list">
          {scope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="feature-availability-actions">
        <Link to="/transcription" className="feature-availability-link">{t(locale, 'app.featureAvailability.backToTranscription')}</Link>
      </div>
    </section>
  );
}