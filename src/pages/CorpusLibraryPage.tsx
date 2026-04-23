import '../styles/pages/feature-availability.css';
import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';
import { t, useLocale } from '../i18n';

export function CorpusLibraryPage() {
  const locale = useLocale();

  return (
    <FeatureAvailabilityPanel
      title={t(locale, 'workspace.corpus.unavailable.title')}
      summary={t(locale, 'workspace.corpus.unavailable.summary')}
      sidePaneTitle={t(locale, 'workspace.corpus.unavailable.sidePaneTitle')}
      sidePaneSubtitle={t(locale, 'workspace.corpus.unavailable.sidePaneSubtitle')}
      scope={[
        t(locale, 'workspace.corpus.unavailable.scope.search'),
        t(locale, 'workspace.corpus.unavailable.scope.export'),
        t(locale, 'workspace.corpus.unavailable.scope.agent'),
      ]}
    />
  );
}
