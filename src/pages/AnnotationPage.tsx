import '../styles/pages/feature-availability.css';
import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';
import { t, useLocale } from '../i18n';

export function AnnotationPage() {
  const locale = useLocale();

  return (
    <FeatureAvailabilityPanel
      title={t(locale, 'workspace.annotation.unavailable.title')}
      summary={t(locale, 'workspace.annotation.unavailable.summary')}
      sidePaneTitle={t(locale, 'workspace.annotation.unavailable.sidePaneTitle')}
      sidePaneSubtitle={t(locale, 'workspace.annotation.unavailable.sidePaneSubtitle')}
      scope={[
        t(locale, 'workspace.annotation.unavailable.scope.segmentation'),
        t(locale, 'workspace.annotation.unavailable.scope.gloss'),
        t(locale, 'workspace.annotation.unavailable.scope.tagging'),
      ]}
    />
  );
}
