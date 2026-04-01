import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';
import { t, useLocale } from '../i18n';

export function WritingPage() {
  const locale = useLocale();

  return (
    <FeatureAvailabilityPanel
      title={t(locale, 'workspace.writing.unavailable.title')}
      summary={t(locale, 'workspace.writing.unavailable.summary')}
      sidePaneTitle={t(locale, 'workspace.writing.unavailable.sidePaneTitle')}
      sidePaneSubtitle={t(locale, 'workspace.writing.unavailable.sidePaneSubtitle')}
      scope={[
        t(locale, 'workspace.writing.unavailable.scope.outline'),
        t(locale, 'workspace.writing.unavailable.scope.citation'),
        t(locale, 'workspace.writing.unavailable.scope.template'),
      ]}
    />
  );
}
