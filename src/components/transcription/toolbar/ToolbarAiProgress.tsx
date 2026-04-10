import type { AcousticRuntimeStatus, VadCacheStatus } from '../../../contexts/AiPanelContext';
import { t, tf, useLocale } from '../../../i18n';

type ToolbarAiProgressProps = {
  acousticRuntimeStatus?: AcousticRuntimeStatus | undefined;
  vadCacheStatus?: VadCacheStatus | undefined;
};

function formatPercent(progressRatio: number | undefined): string {
  return `${Math.round((progressRatio ?? 0) * 100)}%`;
}

export function ToolbarAiProgress({ acousticRuntimeStatus, vadCacheStatus }: ToolbarAiProgressProps) {
  const locale = useLocale();

  const acousticBadge = acousticRuntimeStatus?.state === 'loading'
    ? {
        className: 'toolbar-ai-progress-badge toolbar-ai-progress-badge-acoustic',
        text: `${t(locale, 'ai.acoustic.runtimeProgress')} ${formatPercent(acousticRuntimeStatus.progressRatio)}`,
        title: tf(locale, 'ai.acoustic.runtimeProgressLoading', {
          progress: Math.round((acousticRuntimeStatus.progressRatio ?? 0) * 100),
          processedFrames: acousticRuntimeStatus.processedFrames ?? 0,
          totalFrames: acousticRuntimeStatus.totalFrames ?? 0,
        }),
      }
    : acousticRuntimeStatus?.state === 'error'
      ? {
          className: 'toolbar-ai-progress-badge toolbar-ai-progress-badge-error',
          text: t(locale, 'ai.acoustic.runtimeProgressFailed'),
          title: t(locale, 'ai.acoustic.runtimeProgressFailed'),
        }
      : null;

  const vadBadge = vadCacheStatus?.state === 'warming'
    ? {
        className: 'toolbar-ai-progress-badge toolbar-ai-progress-badge-vad',
        text: `${t(locale, 'ai.stats.vadCacheLabel')} ${formatPercent(vadCacheStatus.progressRatio)}`,
        title: tf(locale, 'ai.stats.vadCacheWarming', {
          engine: vadCacheStatus.engine ?? 'unknown',
          progress: Math.round((vadCacheStatus.progressRatio ?? 0) * 100),
          processedFrames: vadCacheStatus.processedFrames ?? 0,
          totalFrames: vadCacheStatus.totalFrames ?? 0,
        }),
      }
    : null;

  if (!acousticBadge && !vadBadge) {
    return null;
  }

  return (
    <div className="toolbar-ai-progress" aria-live="polite">
      {acousticBadge ? (
        <span className={acousticBadge.className} title={acousticBadge.title}>
          {acousticBadge.text}
        </span>
      ) : null}
      {vadBadge ? (
        <span className={vadBadge.className} title={vadBadge.title}>
          {vadBadge.text}
        </span>
      ) : null}
    </div>
  );
}