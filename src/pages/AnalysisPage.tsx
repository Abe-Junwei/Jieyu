import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';
import { t, useLocale } from '../i18n';

export function AnalysisPage() {
  const locale = useLocale();

  return (
    <FeatureAvailabilityPanel
      title={t(locale, 'workspace.analysis.unavailable.title')}
      summary={t(locale, 'workspace.analysis.unavailable.summary')}
      sidePaneTitle={t(locale, 'workspace.analysis.unavailable.sidePaneTitle')}
      sidePaneSubtitle={t(locale, 'workspace.analysis.unavailable.sidePaneSubtitle')}
      scope={[
        t(locale, 'workspace.analysis.unavailable.scope.stats'),
        t(locale, 'workspace.analysis.unavailable.scope.audit'),
        t(locale, 'workspace.analysis.unavailable.scope.quality'),
      ]}
    />
  );
}
