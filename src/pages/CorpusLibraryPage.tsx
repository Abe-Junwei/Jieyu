/**
 * 语料库页。flag 关时保持占位面板；flag 开时只读列表 + 与转写选择隔离的会话工作集。
 * 落地工作集 / 深链往返时，与转写/标注的 query 合同对齐三页联评 R6–R8（`unitId`、`layer`、`corpusBasket` 等），
 * 并与 ADR 0020 转写轨读模型解耦：语料侧只读出站，不写 lexeme / 层实例。
 */
import '../styles/pages/feature-availability.css';
import '../styles/pages/corpus-library-workspace.css';
import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';
import { featureFlags } from '../ai/config/featureFlags';
import { t, useLocale } from '../i18n';
import { CorpusLibraryWorkspace } from './CorpusLibraryWorkspace';

export function CorpusLibraryPage() {
  const locale = useLocale();

  if (!featureFlags.corpusLibraryPageEnabled) {
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

  return <CorpusLibraryWorkspace />;
}
