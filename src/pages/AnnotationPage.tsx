/**
 * 标注页。flag 关时保持占位面板；flag 开时只读 IGT 列表 + 键盘状态机骨架。
 * 按轨消费 canonical 句段走 `pages/annotation/annotationLaneReadScope`（ADR 0020），本切片不写 token / 层实例。
 */
import '../styles/pages/feature-availability.css';
import '../styles/pages/annotation-workspace.css';
import { FeatureAvailabilityPanel } from '../components/FeatureAvailabilityPanel';
import { featureFlags } from '../ai/config/featureFlags';
import { t, useLocale } from '../i18n';
import { AnnotationWorkspace } from './AnnotationWorkspace';

export function AnnotationPage() {
  const locale = useLocale();

  if (!featureFlags.annotationPageEnabled) {
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

  return <AnnotationWorkspace />;
}
