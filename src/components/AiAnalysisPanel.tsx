import { memo, useMemo } from 'react';
import { Bot, WandSparkles } from 'lucide-react';
import { t, tf, useLocale } from '../i18n';
import { useAiPanelContext } from '../contexts/AiPanelContext';
import { AiEmbeddingCard } from './ai/AiEmbeddingCard';
import { PanelChip } from './ui';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';
import type { AcousticDiagnosticKey } from '../pages/TranscriptionPage.aiPromptContext';
import {
  buildAcousticExportFileStem,
  buildAcousticInspectorSlice,
  serializeAcousticPanelDetailCsv,
  serializeAcousticPanelDetailJson,
  type AcousticPanelTrend,
} from '../utils/acousticPanelDetail';
import type { AcousticHotspotKind } from '../utils/acousticOverlayTypes';

export type AiPanelMode = 'auto' | 'all';

export type AiPanelTask =
  | 'segmentation'
  | 'transcription'
  | 'translation'
  | 'pos_tagging'
  | 'glossing'
  | 'risk_review'
  | 'ai_chat_setup';

export type AiPanelCardKey =
  | 'ai_chat'
  | 'embedding_ops'
  | 'task_observer'
  | 'translation_focus'
  | 'generation_status'
  | 'context_analysis'
  | 'dictionary_matches'
  | 'token_notes'
  | 'pos_tagging'
  | 'phoneme_consistency';

/** 底部面板 tab 类型 | Bottom panel tab keys */
export type AnalysisBottomTab = 'embedding' | 'stats' | 'acoustic';

function formatDb(value: number | null | undefined, digits = 1): string | null {
  return typeof value === 'number' ? `${value.toFixed(digits)} dB` : null;
}

function formatHz(value: number | null | undefined): string | null {
  return typeof value === 'number' ? `${Math.round(value)} Hz` : null;
}

function formatRatio(value: number | null | undefined): string | null {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : null;
}

function formatZeroCrossing(value: number | null | undefined): string | null {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : null;
}

function buildNormalizedPath(
  points: Array<{ timeRatio: number; normalizedF0?: number | null; normalizedIntensity?: number | null }>,
  key: 'normalizedF0' | 'normalizedIntensity',
  width = 120,
  height = 42,
): string | null {
  const plotted = points.filter((point) => typeof point[key] === 'number');
  if (plotted.length === 0) return null;

  return plotted
    .map((point, index) => {
      const x = 2 + (point.timeRatio * (width - 4));
      const y = 2 + ((1 - (point[key] as number)) * (height - 4));
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function downloadTextPayload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

interface AiAnalysisPanelProps {
  isCollapsed: boolean;
  /** 当前激活的模式 tab（控制任务聚焦/全量视图的内容区） */
  activeTab?: AnalysisBottomTab;
  /** 切换模式 tab 回调 */
  onChangeActiveTab?: (tab: AnalysisBottomTab) => void;
}

export const AiAnalysisPanel = memo(function AiAnalysisPanel({
  isCollapsed,
  activeTab = 'embedding',
  onChangeActiveTab,
}: AiAnalysisPanelProps) {
  const locale = useLocale();
  const {
    dbName,
    utteranceCount,
    translationLayerCount,
    aiConfidenceAvg,
    aiCurrentTask,
    aiPanelMode,
    aiVisibleCards,
    onChangeAiPanelMode,
    vadCacheStatus,
    acousticSummary,
    acousticInspector,
    acousticDetail,
    onJumpToAcousticHotspot,
  } = useAiPanelContext();

  const shouldShow = (card: AiPanelCardKey): boolean => {
    if (!aiVisibleCards) return true;
    return aiVisibleCards[card];
  };

  const taskLabel: Record<AiPanelTask, string> = {
    segmentation: t(locale, 'ai.task.segmentation'),
    transcription: t(locale, 'ai.task.transcription'),
    translation: t(locale, 'ai.task.translation'),
    pos_tagging: t(locale, 'ai.task.posTagging'),
    glossing: t(locale, 'ai.task.glossing'),
    risk_review: t(locale, 'ai.task.riskReview'),
    ai_chat_setup: t(locale, 'ai.task.aiChatSetup'),
  };

  if (isCollapsed) return null;

  const currentTaskLabel = aiCurrentTask ? taskLabel[aiCurrentTask] : t(locale, 'ai.header.taskUnknown');
  const vadCacheLabel = vadCacheStatus?.state === 'ready'
    ? tf(locale, 'ai.stats.vadCacheHit', {
      engine: vadCacheStatus.engine ?? 'unknown',
      segmentCount: vadCacheStatus.segmentCount ?? 0,
    })
    : vadCacheStatus?.state === 'missing'
      ? t(locale, 'ai.stats.vadCacheMiss')
      : t(locale, 'ai.stats.vadCacheUnavailable');
  const hotspotKindLabel: Record<AcousticHotspotKind, string> = {
    pitch_peak: t(locale, 'ai.stats.acousticHotspot.pitchPeak'),
    pitch_break: t(locale, 'ai.stats.acousticHotspot.pitchBreak'),
    intensity_peak: t(locale, 'ai.stats.acousticHotspot.intensityPeak'),
    unstable_span: t(locale, 'ai.stats.acousticHotspot.unstableSpan'),
  };
  const hotspotExplanation: Record<AcousticHotspotKind, string> = {
    pitch_peak: t(locale, 'ai.acoustic.hotspotExplain.pitchPeak'),
    pitch_break: t(locale, 'ai.acoustic.hotspotExplain.pitchBreak'),
    intensity_peak: t(locale, 'ai.acoustic.hotspotExplain.intensityPeak'),
    unstable_span: t(locale, 'ai.acoustic.hotspotExplain.unstableSpan'),
  };
  const diagnosticLabel: Record<AcousticDiagnosticKey, string> = {
    low_reliability: t(locale, 'ai.acoustic.diagnostic.lowReliability'),
    low_voicing: t(locale, 'ai.acoustic.diagnostic.lowVoicing'),
    wide_pitch_range: t(locale, 'ai.acoustic.diagnostic.widePitchRange'),
    high_energy_contrast: t(locale, 'ai.acoustic.diagnostic.highEnergyContrast'),
    unstable_focus: t(locale, 'ai.acoustic.diagnostic.unstableFocus'),
  };
  const activeTabLabel = activeTab === 'embedding'
    ? t(locale, 'ai.header.embeddingTab')
    : activeTab === 'acoustic'
      ? t(locale, 'ai.header.acousticTab')
      : t(locale, 'ai.header.statsTab');
  const activeTabDescription = activeTab === 'embedding'
    ? t(locale, 'ai.header.focusModeDesc')
    : activeTab === 'acoustic'
      ? t(locale, 'ai.header.acousticTabDesc')
      : t(locale, 'ai.header.allModeDesc');
  const acousticDurationSec = acousticSummary?.durationSec ?? (
    acousticSummary ? Math.max(acousticSummary.selectionEndSec - acousticSummary.selectionStartSec, 0) : null
  );
  const acousticVoicedRatio = acousticSummary?.voicedRatio ?? (
    acousticSummary && acousticSummary.frameCount > 0
      ? acousticSummary.voicedFrameCount / acousticSummary.frameCount
      : null
  );
  const acousticHotspotCount = acousticSummary?.hotspotCount ?? acousticSummary?.hotspots?.length ?? 0;
  const topHotspot = acousticSummary?.hotspots?.[0] ?? null;
  const acousticSlice = useMemo(
    () => buildAcousticInspectorSlice(acousticDetail ?? null, acousticInspector?.timeSec),
    [acousticDetail, acousticInspector?.timeSec],
  );
  const acousticDescriptorFrame = useMemo(() => {
    if (!acousticDetail || acousticDetail.frames.length === 0 || acousticInspector?.timeSec === undefined) {
      return null;
    }

    return acousticDetail.frames.reduce((closest, current) => {
      if (!closest) return current;
      return Math.abs(current.timeSec - acousticInspector.timeSec) < Math.abs(closest.timeSec - acousticInspector.timeSec)
        ? current
        : closest;
    }, acousticDetail.frames[0] ?? null);
  }, [acousticDetail, acousticInspector?.timeSec]);
  const vowelSpacePoints = useMemo(() => {
    if (!acousticDetail) return [] as Array<{ x: number; y: number; f1Hz: number; f2Hz: number }>;

    const points = acousticDetail.frames
      .filter((frame) => typeof frame.formantF1Hz === 'number' && Number.isFinite(frame.formantF1Hz)
        && typeof frame.formantF2Hz === 'number' && Number.isFinite(frame.formantF2Hz))
      .map((frame) => ({
        f1Hz: frame.formantF1Hz as number,
        f2Hz: frame.formantF2Hz as number,
      }));

    if (points.length === 0) return [];

    const f1Min = Math.min(...points.map((point) => point.f1Hz));
    const f1Max = Math.max(...points.map((point) => point.f1Hz));
    const f2Min = Math.min(...points.map((point) => point.f2Hz));
    const f2Max = Math.max(...points.map((point) => point.f2Hz));

    return points.slice(-48).map((point) => ({
      ...point,
      x: 6 + (1 - (f2Max - f2Min < 1 ? 0.5 : (point.f2Hz - f2Min) / (f2Max - f2Min))) * 108,
      y: 6 + (f1Max - f1Min < 1 ? 0.5 : (point.f1Hz - f1Min) / (f1Max - f1Min)) * 46,
    }));
  }, [acousticDetail]);
  const toneF0Path = useMemo(
    () => buildNormalizedPath(acousticDetail?.toneBins ?? [], 'normalizedF0'),
    [acousticDetail],
  );
  const toneIntensityPath = useMemo(
    () => buildNormalizedPath(acousticDetail?.toneBins ?? [], 'normalizedIntensity'),
    [acousticDetail],
  );
  const trendLabel: Record<AcousticPanelTrend, string> = {
    rising: t(locale, 'ai.acoustic.trend.rising'),
    falling: t(locale, 'ai.acoustic.trend.falling'),
    flat: t(locale, 'ai.acoustic.trend.flat'),
    mixed: t(locale, 'ai.acoustic.trend.mixed'),
  };

  const handleExportAcoustic = (format: 'csv' | 'json') => {
    if (!acousticDetail) return;
    const stem = buildAcousticExportFileStem(acousticDetail);
    if (format === 'csv') {
      downloadTextPayload(`${stem}.csv`, serializeAcousticPanelDetailCsv(acousticDetail), 'text/csv;charset=utf-8');
      return;
    }
    downloadTextPayload(`${stem}.json`, serializeAcousticPanelDetailJson(acousticDetail), 'application/json;charset=utf-8');
  };

  return (
    <div className="transcription-analysis-panel panel-design-match-content">
      <div className="transcription-analysis-panel-header">
        <div className="transcription-ai-header-title">
          <Bot size={14} />
          <span className="transcription-analysis-toolbar-title">{t(locale, 'ai.header.title')}</span>
        </div>
        <div className="transcription-ai-mode-switch" role="group" aria-label={t(locale, 'ai.header.modeSwitch')}>
          <button
            type="button"
            className={`transcription-ai-mode-btn ${aiPanelMode === 'auto' ? 'is-active' : ''}`}
            disabled={aiPanelMode === 'auto'}
            aria-pressed={aiPanelMode === 'auto'}
            aria-label={t(locale, 'ai.header.focusModeDesc')}
            title={t(locale, 'ai.header.focusModeDesc')}
            onClick={() => onChangeAiPanelMode?.('auto')}
          >
            {t(locale, 'ai.header.focusMode')}
          </button>
          <button
            type="button"
            className={`transcription-ai-mode-btn ${aiPanelMode === 'all' ? 'is-active' : ''}`}
            disabled={aiPanelMode === 'all'}
            aria-pressed={aiPanelMode === 'all'}
            aria-label={t(locale, 'ai.header.allModeDesc')}
            title={t(locale, 'ai.header.allModeDesc')}
            onClick={() => onChangeAiPanelMode?.('all')}
          >
            {t(locale, 'ai.header.allMode')}
          </button>
        </div>
      </div>

      <div className="transcription-analysis-panel-body">
        <PanelSummary
          className="transcription-analysis-panel-summary"
          title={activeTabLabel}
          description={`${t(locale, 'ai.header.currentTask')}${currentTaskLabel}`}
          meta={(
            <div className="panel-meta">
              <PanelChip>{tf(locale, 'ai.stats.database', { dbName })}</PanelChip>
              <PanelChip>{tf(locale, 'ai.stats.utterance', { utteranceCount })}</PanelChip>
              <PanelChip>{tf(locale, 'ai.stats.translationLayer', { translationLayerCount })}</PanelChip>
              {activeTab === 'acoustic' && acousticSummary ? (
                <>
                  {acousticDurationSec != null ? <PanelChip>{tf(locale, 'ai.acoustic.duration', { durationSec: acousticDurationSec.toFixed(2) })}</PanelChip> : null}
                  <PanelChip>{tf(locale, 'ai.acoustic.hotspotCount', { count: acousticHotspotCount })}</PanelChip>
                </>
              ) : null}
            </div>
          )}
          supportingText={activeTabDescription}
        />

        <div className="transcription-analysis-tab-content">
          {activeTab === 'embedding' && shouldShow('embedding_ops') && <AiEmbeddingCard />}
          {activeTab === 'stats' && (
            <PanelSection
              className="transcription-analysis-stats-section"
              title={t(locale, 'ai.header.statsTab')}
              description={`${t(locale, 'ai.header.currentTask')}${currentTaskLabel}`}
            >
              <div className="transcription-ai-stats-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.header.currentTask')}</span>
                  <span className="transcription-analysis-stats-value" aria-live="polite">{currentTaskLabel}</span>
                </div>
                <div className="transcription-analysis-stats-row transcription-analysis-stats-row-accent">
                  <span className="transcription-analysis-stats-label transcription-analysis-stats-label-accent">
                    <WandSparkles size={12} />
                    <span>{currentTaskLabel}</span>
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {aiConfidenceAvg === null ? t(locale, 'ai.stats.aiConfidenceNone') : tf(locale, 'ai.stats.aiConfidence', { confidence: (aiConfidenceAvg * 100).toFixed(1) })}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.vadCacheLabel')}</span>
                  <span className="transcription-analysis-stats-value">{vadCacheLabel}</span>
                </div>
              </div>
            </PanelSection>
          )}
          {activeTab === 'acoustic' && (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-overview-section"
              title={t(locale, 'ai.stats.acousticTitle')}
              description={t(locale, 'ai.acoustic.summaryDescription')}
            >
              {acousticSummary ? (
                <div className="transcription-analysis-acoustic-panel">
                  <div className="transcription-analysis-acoustic-hero">
                    <div className="transcription-analysis-acoustic-hero-card">
                      <span className="transcription-analysis-acoustic-hero-label">{t(locale, 'ai.acoustic.durationLabel')}</span>
                      <strong className="transcription-analysis-acoustic-hero-value">{acousticDurationSec != null ? `${acousticDurationSec.toFixed(2)}s` : t(locale, 'ai.stats.acousticUnavailable')}</strong>
                    </div>
                    <div className="transcription-analysis-acoustic-hero-card">
                      <span className="transcription-analysis-acoustic-hero-label">{t(locale, 'ai.acoustic.voicedRatio')}</span>
                      <strong className="transcription-analysis-acoustic-hero-value">{formatRatio(acousticVoicedRatio) ?? t(locale, 'ai.stats.acousticUnavailable')}</strong>
                    </div>
                    <div className="transcription-analysis-acoustic-hero-card">
                      <span className="transcription-analysis-acoustic-hero-label">{t(locale, 'ai.stats.acousticHotspots')}</span>
                      <strong className="transcription-analysis-acoustic-hero-value">{acousticHotspotCount}</strong>
                    </div>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticSelection')}</span>
                    <span className="transcription-analysis-stats-value">
                      {acousticSummary.selectionStartSec.toFixed(2)}-{acousticSummary.selectionEndSec.toFixed(2)}s
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticF0')}</span>
                    <span className="transcription-analysis-stats-value">
                      {typeof acousticSummary.f0MinHz === 'number' && typeof acousticSummary.f0MeanHz === 'number' && typeof acousticSummary.f0MaxHz === 'number'
                        ? `${Math.round(acousticSummary.f0MinHz)} / ${Math.round(acousticSummary.f0MeanHz)} / ${Math.round(acousticSummary.f0MaxHz)} Hz`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticIntensityPeak')}</span>
                    <span className="transcription-analysis-stats-value">
                      {typeof acousticSummary.intensityPeakDb === 'number'
                        ? `${acousticSummary.intensityPeakDb.toFixed(1)} dB`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.intensityRange')}</span>
                    <span className="transcription-analysis-stats-value">
                      {formatDb(acousticSummary.intensityMinDb) && formatDb(acousticSummary.intensityPeakDb)
                        ? `${formatDb(acousticSummary.intensityMinDb)} / ${formatDb(acousticSummary.intensityPeakDb)}`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticReliability')}</span>
                    <span className="transcription-analysis-stats-value">
                      {typeof acousticSummary.reliabilityMean === 'number'
                        ? `${acousticSummary.reliabilityMean.toFixed(2)} · ${tf(locale, 'ai.stats.acousticVoicedFrames', { voiced: acousticSummary.voicedFrameCount, total: acousticSummary.frameCount })}`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="transcription-analysis-acoustic-empty">{t(locale, 'ai.stats.acousticUnavailableHint')}</div>
              )}
            </PanelSection>
          )}
          {activeTab === 'acoustic' && acousticDetail ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-runtime-section"
              title={t(locale, 'ai.acoustic.runtimeTitle')}
              description={t(locale, 'ai.acoustic.runtimeDescription')}
            >
              <div className="transcription-analysis-acoustic-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeAlgorithm')}</span>
                  <span className="transcription-analysis-stats-value">{acousticDetail.algorithmVersion}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeSampleRate')}</span>
                  <span className="transcription-analysis-stats-value">{acousticDetail.sampleRate} Hz</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeWindow')}</span>
                  <span className="transcription-analysis-stats-value">{acousticDetail.analysisWindowSec.toFixed(3)}s / {acousticDetail.frameStepSec.toFixed(3)}s</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeThreshold')}</span>
                  <span className="transcription-analysis-stats-value">YIN {acousticDetail.yinThreshold.toFixed(2)} · RMS {acousticDetail.silenceRmsThreshold.toFixed(3)}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeVad')}</span>
                  <span className="transcription-analysis-stats-value">{vadCacheLabel}</span>
                </div>
              </div>
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-inspector-section"
              title={t(locale, 'ai.acoustic.inspectorTitle')}
              description={t(locale, 'ai.acoustic.inspectorDescription')}
            >
              {acousticInspector ? (
                <div className="transcription-analysis-acoustic-panel">
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.inspectorSource')}</span>
                    <span className="transcription-analysis-stats-value">
                      {acousticInspector.source === 'spectrogram'
                        ? t(locale, 'ai.acoustic.inspectorSource.spectrogram')
                        : t(locale, 'ai.acoustic.inspectorSource.waveform')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.inspectorTime')}</span>
                    <span className="transcription-analysis-stats-value">{acousticInspector.timeSec.toFixed(2)}s</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.inspectorFrequency')}</span>
                    <span className="transcription-analysis-stats-value">
                      {typeof acousticInspector.frequencyHz === 'number'
                        ? `${Math.round(acousticInspector.frequencyHz)} Hz`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticF0')}</span>
                    <span className="transcription-analysis-stats-value">{formatHz(acousticInspector.f0Hz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticIntensityPeak')}</span>
                    <span className="transcription-analysis-stats-value">{formatDb(acousticInspector.intensityDb) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.inspectorSelectionState')}</span>
                    <span className="transcription-analysis-stats-value">
                      {acousticInspector.inSelection === false
                        ? t(locale, 'ai.acoustic.inspectorSelectionState.outside')
                        : t(locale, 'ai.acoustic.inspectorSelectionState.inside')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.inspectorNearestHotspot')}</span>
                    <span className="transcription-analysis-stats-value">
                      {acousticInspector.matchedHotspotKind
                        ? `${hotspotKindLabel[acousticInspector.matchedHotspotKind]} · ${(acousticInspector.matchedHotspotTimeSec ?? acousticInspector.timeSec).toFixed(2)}s`
                        : t(locale, 'ai.acoustic.topHotspotNone')}
                    </span>
                  </div>
                  {acousticInspector.matchedHotspotTimeSec != null && onJumpToAcousticHotspot ? (
                    <div className="transcription-analysis-acoustic-inspector-actions">
                      <button
                        type="button"
                        className="transcription-analysis-acoustic-nav-btn"
                        onClick={() => onJumpToAcousticHotspot(acousticInspector.matchedHotspotTimeSec as number)}
                      >
                        {t(locale, 'ai.acoustic.inspectorJumpHotspot')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="transcription-analysis-acoustic-empty">{t(locale, 'ai.acoustic.inspectorHint')}</div>
              )}
            </PanelSection>
          )}
          {activeTab === 'acoustic' && acousticSummary ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-diagnostics-section"
              title={t(locale, 'ai.acoustic.diagnosticsTitle')}
              description={t(locale, 'ai.acoustic.diagnosticsDescription')}
            >
              {acousticSummary.diagnostics && acousticSummary.diagnostics.length > 0 ? (
                <div className="transcription-analysis-acoustic-diagnostics-list">
                  {acousticSummary.diagnostics.map((diagnostic) => (
                    <div key={diagnostic} className="transcription-analysis-acoustic-diagnostic-item">
                      <PanelChip variant="warning">{diagnosticLabel[diagnostic]}</PanelChip>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="transcription-analysis-acoustic-empty">{t(locale, 'ai.acoustic.diagnosticsEmpty')}</div>
              )}
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && acousticDetail ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-descriptor-section"
              title={t(locale, 'ai.acoustic.descriptorTitle')}
              description={t(locale, 'ai.acoustic.descriptorDescription')}
            >
              <div className="transcription-analysis-acoustic-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorCentroidMean')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticSummary?.spectralCentroidMeanHz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorRolloffMean')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticSummary?.spectralRolloffMeanHz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorZeroCrossingMean')}</span>
                  <span className="transcription-analysis-stats-value">{formatZeroCrossing(acousticSummary?.zeroCrossingRateMean) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorCentroidCurrent')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticDescriptorFrame?.spectralCentroidHz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorRolloffCurrent')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticDescriptorFrame?.spectralRolloffHz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorZeroCrossingCurrent')}</span>
                  <span className="transcription-analysis-stats-value">{formatZeroCrossing(acousticDescriptorFrame?.zeroCrossingRate) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
              </div>
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && acousticDetail ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-slice-section"
              title={t(locale, 'ai.acoustic.sliceTitle')}
              description={t(locale, 'ai.acoustic.sliceDescription')}
            >
              {acousticSlice ? (
                <div className="transcription-analysis-acoustic-panel">
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.sliceWindow')}</span>
                    <span className="transcription-analysis-stats-value">{acousticSlice.startSec.toFixed(2)}-{acousticSlice.endSec.toFixed(2)}s</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.sliceSampleCount')}</span>
                    <span className="transcription-analysis-stats-value">{acousticSlice.sampleCount}</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.sliceVoicedCount')}</span>
                    <span className="transcription-analysis-stats-value">{acousticSlice.voicedSampleCount}</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.slicePitchRange')}</span>
                    <span className="transcription-analysis-stats-value">
                      {formatHz(acousticSlice.pitchMinHz) && formatHz(acousticSlice.pitchMaxHz)
                        ? `${formatHz(acousticSlice.pitchMinHz)} / ${formatHz(acousticSlice.pitchMaxHz)}`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.sliceIntensityRange')}</span>
                    <span className="transcription-analysis-stats-value">
                      {formatDb(acousticSlice.intensityMinDb) && formatDb(acousticSlice.intensityMaxDb)
                        ? `${formatDb(acousticSlice.intensityMinDb)} / ${formatDb(acousticSlice.intensityMaxDb)}`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.sliceReliability')}</span>
                    <span className="transcription-analysis-stats-value">{acousticSlice.reliabilityMean != null ? acousticSlice.reliabilityMean.toFixed(2) : t(locale, 'ai.stats.acousticUnavailable')}</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.slicePitchTrend')}</span>
                    <span className="transcription-analysis-stats-value">{trendLabel[acousticSlice.pitchTrend]}</span>
                  </div>
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.sliceIntensityTrend')}</span>
                    <span className="transcription-analysis-stats-value">{trendLabel[acousticSlice.intensityTrend]}</span>
                  </div>
                </div>
              ) : (
                <div className="transcription-analysis-acoustic-empty">{t(locale, 'ai.acoustic.inspectorHint')}</div>
              )}
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && acousticDetail ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-formant-section"
              title={t(locale, 'ai.acoustic.formantTitle')}
              description={t(locale, 'ai.acoustic.formantDescription')}
            >
              <div className="transcription-analysis-acoustic-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.formantF1Mean')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticSummary?.formantF1MeanHz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.formantF2Mean')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticSummary?.formantF2MeanHz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.formantF1Current')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticDescriptorFrame?.formantF1Hz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.formantF2Current')}</span>
                  <span className="transcription-analysis-stats-value">{formatHz(acousticDescriptorFrame?.formantF2Hz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.vowelSpread')}</span>
                  <span className="transcription-analysis-stats-value">{typeof acousticSummary?.vowelSpaceSpread === 'number' ? `${Math.round(acousticSummary.vowelSpaceSpread)} Hz` : t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                {vowelSpacePoints.length > 0 ? (
                  <div className="transcription-analysis-acoustic-tone-card">
                    <div className="transcription-analysis-acoustic-tone-legend">
                      <span className="transcription-analysis-acoustic-tone-legend-item transcription-analysis-acoustic-tone-legend-item-f0">{t(locale, 'ai.acoustic.vowelSpaceLegend')}</span>
                    </div>
                    <div className="transcription-analysis-acoustic-tone-chart" role="img" aria-label={t(locale, 'ai.acoustic.vowelSpaceTitle')}>
                      <svg viewBox="0 0 120 52" preserveAspectRatio="none" aria-hidden="true">
                        <path className="transcription-analysis-acoustic-tone-grid" d="M6 6 H114 V46 H6 Z" />
                        {vowelSpacePoints.map((point, index) => (
                          <circle
                            key={`vowel-${index}-${point.f1Hz.toFixed(1)}-${point.f2Hz.toFixed(1)}`}
                            cx={point.x.toFixed(2)}
                            cy={point.y.toFixed(2)}
                            r="1.6"
                            className="transcription-analysis-acoustic-tone-line-intensity"
                          />
                        ))}
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="transcription-analysis-acoustic-empty">{t(locale, 'ai.acoustic.vowelSpaceEmpty')}</div>
                )}
              </div>
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && acousticDetail ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-tone-section"
              title={t(locale, 'ai.acoustic.toneTitle')}
              description={t(locale, 'ai.acoustic.toneDescription')}
              meta={<PanelChip>{tf(locale, 'ai.acoustic.exportSampleCount', { count: acousticDetail.sampleCount })}</PanelChip>}
            >
              {acousticDetail.toneBins.length > 0 ? (
                <div className="transcription-analysis-acoustic-tone-card">
                  <div className="transcription-analysis-acoustic-tone-legend">
                    <span className="transcription-analysis-acoustic-tone-legend-item transcription-analysis-acoustic-tone-legend-item-f0">{t(locale, 'ai.acoustic.toneLegendF0')}</span>
                    <span className="transcription-analysis-acoustic-tone-legend-item transcription-analysis-acoustic-tone-legend-item-intensity">{t(locale, 'ai.acoustic.toneLegendIntensity')}</span>
                  </div>
                  <div className="transcription-analysis-acoustic-tone-chart" role="img" aria-label={t(locale, 'ai.acoustic.toneTitle')}>
                    <svg viewBox="0 0 120 42" preserveAspectRatio="none" aria-hidden="true">
                      <path className="transcription-analysis-acoustic-tone-grid" d="M2 8 H118 M2 21 H118 M2 34 H118" />
                      {toneIntensityPath ? <path className="transcription-analysis-acoustic-tone-line transcription-analysis-acoustic-tone-line-intensity" d={toneIntensityPath} /> : null}
                      {toneF0Path ? <path className="transcription-analysis-acoustic-tone-line transcription-analysis-acoustic-tone-line-f0" d={toneF0Path} /> : null}
                    </svg>
                  </div>
                  <div className="transcription-analysis-acoustic-tone-footer">
                    <span>{acousticDetail.selectionStartSec.toFixed(2)}s</span>
                    <span>{acousticDetail.selectionEndSec.toFixed(2)}s</span>
                  </div>
                </div>
              ) : (
                <div className="transcription-analysis-acoustic-empty">{t(locale, 'ai.acoustic.toneEmpty')}</div>
              )}
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && acousticSummary ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-hotspots-section"
              title={t(locale, 'ai.stats.acousticHotspots')}
              description={t(locale, 'ai.acoustic.hotspotsDescription')}
              meta={<PanelChip>{acousticHotspotCount}</PanelChip>}
            >
              {acousticSummary.hotspots && acousticSummary.hotspots.length > 0 ? (
                <div className="transcription-analysis-acoustic-hotspots-list">
                  {acousticSummary.hotspots.map((hotspot) => {
                    const hotspotRange = typeof hotspot.startSec === 'number' && typeof hotspot.endSec === 'number'
                      ? `${hotspot.startSec.toFixed(2)}-${hotspot.endSec.toFixed(2)}s`
                      : `${hotspot.timeSec.toFixed(2)}s`;
                    const hotspotF0 = formatHz(hotspot.f0Hz);
                    const hotspotIntensity = formatDb(hotspot.intensityDb);
                    const hotspotReliability = formatRatio(hotspot.reliability);

                    return (
                      <button
                        key={`${hotspot.kind}-${hotspot.timeSec}`}
                        type="button"
                        className="transcription-analysis-acoustic-hotspot transcription-analysis-acoustic-hotspot-detailed"
                        onClick={() => onJumpToAcousticHotspot?.(hotspot.timeSec)}
                        title={tf(locale, 'ai.stats.acousticHotspotJump', { kind: hotspotKindLabel[hotspot.kind], timeSec: hotspot.timeSec.toFixed(2) })}
                        disabled={!onJumpToAcousticHotspot}
                      >
                        <div className="transcription-analysis-acoustic-hotspot-head">
                          <span className="transcription-analysis-acoustic-hotspot-kind">{hotspotKindLabel[hotspot.kind]}</span>
                          <span className="transcription-analysis-acoustic-hotspot-time">{hotspot.timeSec.toFixed(2)}s</span>
                        </div>
                        <p className="transcription-analysis-acoustic-hotspot-description">{hotspotExplanation[hotspot.kind]}</p>
                        <div className="transcription-analysis-acoustic-hotspot-meta">
                          <PanelChip>{tf(locale, 'ai.acoustic.hotspotScore', { score: Math.round(hotspot.score * 100) })}</PanelChip>
                          <PanelChip>{tf(locale, 'ai.acoustic.hotspotWindow', { window: hotspotRange })}</PanelChip>
                          {hotspotF0 ? <PanelChip>{tf(locale, 'ai.acoustic.hotspotF0', { value: hotspotF0 })}</PanelChip> : null}
                          {hotspotIntensity ? <PanelChip>{tf(locale, 'ai.acoustic.hotspotIntensity', { value: hotspotIntensity })}</PanelChip> : null}
                          {hotspotReliability ? <PanelChip>{tf(locale, 'ai.acoustic.hotspotReliability', { value: hotspotReliability })}</PanelChip> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="transcription-analysis-acoustic-empty">{t(locale, 'ai.acoustic.topHotspotNone')}</div>
              )}
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && acousticSummary ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-navigation-section"
              title={t(locale, 'ai.acoustic.navigationTitle')}
              description={t(locale, 'ai.acoustic.navigationDescription')}
            >
              <div className="transcription-analysis-acoustic-navigation-list">
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => onJumpToAcousticHotspot?.(acousticSummary.selectionStartSec)}
                  disabled={!onJumpToAcousticHotspot}
                >
                  {t(locale, 'ai.acoustic.jumpSelectionStart')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => onJumpToAcousticHotspot?.(acousticSummary.selectionEndSec)}
                  disabled={!onJumpToAcousticHotspot}
                >
                  {t(locale, 'ai.acoustic.jumpSelectionEnd')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => topHotspot && onJumpToAcousticHotspot?.(topHotspot.timeSec)}
                  disabled={!onJumpToAcousticHotspot || !topHotspot}
                >
                  {t(locale, 'ai.acoustic.jumpTopHotspot')}
                </button>
              </div>
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && acousticDetail ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-export-section"
              title={t(locale, 'ai.acoustic.exportTitle')}
              description={t(locale, 'ai.acoustic.exportDescription')}
            >
              <div className="transcription-analysis-acoustic-export-actions">
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => handleExportAcoustic('csv')}
                >
                  {t(locale, 'ai.acoustic.exportCsv')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => handleExportAcoustic('json')}
                >
                  {t(locale, 'ai.acoustic.exportJson')}
                </button>
              </div>
              <p className="transcription-analysis-acoustic-export-note">{t(locale, 'ai.acoustic.exportBackendNote')}</p>
            </PanelSection>
          ) : null}
        </div>
      </div>

      <div className="transcription-analysis-panel-footer">
        {(['embedding', 'stats', 'acoustic'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`transcription-assistant-hub-tab ${activeTab === tab ? 'transcription-assistant-hub-tab-active' : ''}`}
            onClick={() => onChangeActiveTab?.(tab)}
          >
            {tab === 'embedding'
              ? t(locale, 'ai.header.embeddingTab')
              : tab === 'acoustic'
                ? t(locale, 'ai.header.acousticTab')
                : t(locale, 'ai.header.statsTab')}
          </button>
        ))}
      </div>
    </div>
  );
});
