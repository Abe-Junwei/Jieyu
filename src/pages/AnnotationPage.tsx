/**
 * 标注页占位。开放编辑后，按轨消费 canonical 句段请复用 `pages/annotation/annotationLaneReadScope`（ADR 0020），
 * 与 `saveUnitText` / token 写链同源，避免自建第二读模型。
 */
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
