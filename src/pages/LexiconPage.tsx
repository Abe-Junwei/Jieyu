import '../styles/pages/feature-availability.css';
import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';
import { t, useLocale } from '../i18n';

export function LexiconPage() {
  const locale = useLocale();

  return (
    <FeatureAvailabilityPanel
      title={t(locale, 'workspace.lexicon.unavailable.title')}
      summary={t(locale, 'workspace.lexicon.unavailable.summary')}
      sidePaneTitle={t(locale, 'workspace.lexicon.unavailable.sidePaneTitle')}
      sidePaneSubtitle={t(locale, 'workspace.lexicon.unavailable.sidePaneSubtitle')}
      scope={[
        t(locale, 'workspace.lexicon.unavailable.scope.entry'),
        t(locale, 'workspace.lexicon.unavailable.scope.backlink'),
        t(locale, 'workspace.lexicon.unavailable.scope.review'),
      ]}
    />
  );
}
