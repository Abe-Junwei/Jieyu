/**
 * 标注页。flag 关时保持占位面板；flag 开时 IGT + 播放 + 备注/确信度 + AutoGloss 预览采纳（B4c/d/e）。
 * 按轨消费 canonical 句段走 `pages/annotation/annotationLaneReadScope`（ADR 0020）。
 * Token 写 `unit_tokens`，词素写 `unit_morphemes`，链接写 `token_lexeme_links`，备注写 `user_notes`；
 * selfCertainty 只补丁该 `layer_units` 行；不改转写文本/时间码；不接 ChatWindow。
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
