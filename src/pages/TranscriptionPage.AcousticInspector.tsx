import { t, tf, useLocale } from '../i18n';
import { useAiPanelContext } from '../contexts/AiPanelContext';
import { AiAnalysisPanelAcousticTabContent } from '../components/AiAnalysisPanelAcousticTabContent';
import { useAiAnalysisPanelAcousticModel } from '../components/useAiAnalysisPanelAcousticModel';

export function TranscriptionPageAcousticInspector({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const panel = useAiPanelContext();
  const model = useAiAnalysisPanelAcousticModel(panel);
  const vadCacheStatus = panel.vadCacheStatus;
  const vadCacheLabel =
    vadCacheStatus?.state === 'ready'
      ? tf(locale, 'ai.stats.vadCacheHit', {
          engine: vadCacheStatus.engine ?? 'unknown',
          segmentCount: vadCacheStatus.segmentCount ?? 0,
        })
      : vadCacheStatus?.state === 'warming'
        ? tf(locale, 'ai.stats.vadCacheWarming', {
            engine: vadCacheStatus.engine ?? 'unknown',
            progress: Math.round((vadCacheStatus.progressRatio ?? 0) * 100),
            processedFrames: vadCacheStatus.processedFrames ?? 0,
            totalFrames: vadCacheStatus.totalFrames ?? 0,
          })
        : vadCacheStatus?.state === 'missing'
          ? t(locale, 'ai.stats.vadCacheMiss')
          : t(locale, 'ai.stats.vadCacheUnavailable');

  return (
    <section
      className="transcription-acoustic-inspector"
      data-testid="transcription-acoustic-inspector"
      aria-label={t(locale, 'transcription.acousticInspector.region')}
    >
      <div className="transcription-acoustic-inspector-header">
        <span>{t(locale, 'ai.header.acousticTab')}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          title={t(locale, 'transcription.acousticInspector.close')}
        >
          {t(locale, 'transcription.acousticInspector.close')}
        </button>
      </div>
      <div className="transcription-acoustic-inspector-body">
        <AiAnalysisPanelAcousticTabContent
          activeTab="acoustic"
          vadCacheLabel={vadCacheLabel}
          model={model}
        />
      </div>
    </section>
  );
}
