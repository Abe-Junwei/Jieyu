import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Bot, WandSparkles } from 'lucide-react';
import { t, tf, useLocale } from '../i18n';
import { useAiPanelContext } from '../contexts/AiPanelContext';
import { AiEmbeddingCard } from './ai/AiEmbeddingCard';
import { PanelChip } from './ui';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';
import type { AcousticDiagnosticKey } from '../pages/TranscriptionPage.aiPromptContext';
import {
  buildAcousticBatchExportFileStem,
  buildAcousticExportFileStem,
  buildAcousticInspectorSlice,
  type AcousticPanelBatchDetail,
  type AcousticPanelDetail,
  type AcousticPanelTrend,
} from '../utils/acousticPanelDetail';
import {
  DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
  type AcousticAnalysisConfig,
  type AcousticHotspotKind,
} from '../utils/acousticOverlayTypes';
import {
  ACOUSTIC_ANALYSIS_PRESETS,
  type AcousticAnalysisPresetKey,
} from '../utils/acousticAnalysisPresets';
import {
  ACOUSTIC_NUMERIC_BOUNDS,
  PROVIDER_PREFERENCE_AUTO,
  areAcousticConfigOverridesEqual,
  buildNormalizedPath,
  downloadTextPayload,
  findNearestFrameByTime,
  formatCoefficients,
  formatDb,
  formatDelta,
  formatHz,
  formatRatio,
  formatScalar,
  formatZeroCrossing,
  measureAcousticExportPayloadStats,
  pruneAcousticConfigOverride,
  resolveAcousticExportFilename,
  resolveAcousticExportMimeType,
  resolvePresetKeyFromOverride,
  serializeAcousticExportSync,
  serializeAcousticExportWithWorker,
  shouldRejectAcousticExportPayload,
  type AcousticConfigOverride,
  type AcousticExportFormat,
} from './ai/aiAnalysisPanelAcousticUtils';
import {
  acousticProviderDefinitions,
  persistAcousticProviderRuntimeConfig,
  probeExternalAcousticProviderHealth,
  resolveAcousticProviderRuntimeConfig,
  type AcousticProviderRuntimeConfig,
  type ExternalAcousticProviderHealthCheckResult,
} from '../services/acoustic/acousticProviderContract';

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

type ProviderConfigSaveState = 'idle' | 'saved' | 'error';

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
    acousticRuntimeStatus,
    acousticSummary,
    acousticInspector,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticDetail,
    acousticDetailFullMedia,
    acousticBatchDetails,
    acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus,
    onJumpToAcousticHotspot,
    onPinInspector,
    onClearPinnedInspector,
    onSelectHotspot,
    onChangeAcousticConfig,
    onResetAcousticConfig,
    acousticConfigOverride,
    acousticProviderPreference,
    acousticProviderState,
    onChangeAcousticProvider,
    onRefreshAcousticProviderState,
  } = useAiPanelContext();

  const [activePreset, setActivePreset] = useState<AcousticAnalysisPresetKey>('default');
  const [draftAcousticConfigOverride, setDraftAcousticConfigOverride] = useState<AcousticConfigOverride>(() => acousticConfigOverride ?? null);
  const [exportScope, setExportScope] = useState<'selection' | 'full_media' | 'batch_selection'>('selection');
  const [providerRuntimeConfig, setProviderRuntimeConfig] = useState<AcousticProviderRuntimeConfig>(() => resolveAcousticProviderRuntimeConfig());
  const [providerSaveState, setProviderSaveState] = useState<ProviderConfigSaveState>('idle');
  const [providerSaveError, setProviderSaveError] = useState<string | null>(null);
  const [providerHealthChecking, setProviderHealthChecking] = useState(false);
  const [providerHealthResult, setProviderHealthResult] = useState<ExternalAcousticProviderHealthCheckResult | null>(null);
  const [acousticExporting, setAcousticExporting] = useState(false);
  const [acousticExportError, setAcousticExportError] = useState<string | null>(null);
  const providerHealthAbortRef = useRef<AbortController | null>(null);
  const providerHealthRequestSeqRef = useRef(0);

  const effectiveDraftAcousticConfig = useMemo<AcousticAnalysisConfig>(() => ({
    ...DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    ...(draftAcousticConfigOverride ?? {}),
  }), [draftAcousticConfigOverride]);
  const hasPendingAcousticConfigChanges = !areAcousticConfigOverridesEqual(
    draftAcousticConfigOverride,
    acousticConfigOverride ?? null,
  );

  useEffect(() => {
    setDraftAcousticConfigOverride(acousticConfigOverride ?? null);
  }, [acousticConfigOverride]);

  useEffect(() => {
    const resolvedPreset = resolvePresetKeyFromOverride(draftAcousticConfigOverride);
    setActivePreset((previous) => (previous === resolvedPreset ? previous : resolvedPreset));
  }, [draftAcousticConfigOverride]);

  const handlePresetChange = useCallback((key: AcousticAnalysisPresetKey) => {
    if (key === 'custom') return;
    setActivePreset(key);
    if (key === 'default') {
      setDraftAcousticConfigOverride(null);
      return;
    }
    const preset = ACOUSTIC_ANALYSIS_PRESETS.find((p) => p.key === key);
    if (preset) {
      setDraftAcousticConfigOverride(preset.config);
    }
  }, []);

  const handleNumericConfigChange = useCallback((key: keyof Pick<AcousticAnalysisConfig, 'pitchFloorHz' | 'pitchCeilingHz' | 'analysisWindowSec' | 'frameStepSec' | 'silenceRmsThreshold'>) => (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = event.target.value.trim();
    if (raw.length === 0) return;

    const value = Number(raw);
    if (!Number.isFinite(value)) return;

    const bounds = ACOUSTIC_NUMERIC_BOUNDS[key];
    const clampedValue = Math.min(bounds.max, Math.max(bounds.min, value));
    if (clampedValue === effectiveDraftAcousticConfig[key]) return;

    setActivePreset('custom');
    setDraftAcousticConfigOverride((previous) => ({
      ...(previous ?? {}),
      [key]: clampedValue,
    }));
  }, [effectiveDraftAcousticConfig]);

  const handleResetAcousticConfigDraft = useCallback(() => {
    setActivePreset('default');
    setDraftAcousticConfigOverride(null);
  }, []);

  const handleApplyAcousticConfig = useCallback(() => {
    if (!hasPendingAcousticConfigChanges) return;
    const normalizedDraft = pruneAcousticConfigOverride(draftAcousticConfigOverride);
    if (!normalizedDraft) {
      onResetAcousticConfig?.();
      return;
    }
    onChangeAcousticConfig?.(normalizedDraft, { replace: true });
  }, [draftAcousticConfigOverride, hasPendingAcousticConfigChanges, onChangeAcousticConfig, onResetAcousticConfig]);

  const handleProviderRoutingStrategyChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextStrategy = event.target.value === 'prefer-external' ? 'prefer-external' : 'local-first';
    setProviderRuntimeConfig((previous) => ({
      ...previous,
      routingStrategy: nextStrategy,
    }));
    setProviderSaveState('idle');
    setProviderSaveError(null);
  }, []);

  const handleProviderExternalEnabledChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setProviderRuntimeConfig((previous) => ({
      ...previous,
      externalProvider: {
        ...previous.externalProvider,
        enabled: checked,
      },
    }));
    setProviderSaveState('idle');
    setProviderSaveError(null);
  }, []);

  const handleProviderEndpointChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const endpoint = event.target.value;
    setProviderRuntimeConfig((previous) => ({
      ...previous,
      externalProvider: {
        ...previous.externalProvider,
        endpoint,
      },
    }));
    setProviderSaveState('idle');
    setProviderSaveError(null);
  }, []);

  const handleProviderApiKeyChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const apiKey = event.target.value;
    setProviderRuntimeConfig((previous) => ({
      ...previous,
      externalProvider: {
        ...previous.externalProvider,
        apiKey,
      },
    }));
    setProviderSaveState('idle');
    setProviderSaveError(null);
  }, []);

  const handleProviderTimeoutChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    const timeoutMs = Math.max(500, Math.min(120_000, Math.round(value)));
    setProviderRuntimeConfig((previous) => ({
      ...previous,
      externalProvider: {
        ...previous.externalProvider,
        timeoutMs,
      },
    }));
    setProviderSaveState('idle');
    setProviderSaveError(null);
  }, []);

  const handleReloadProviderConfig = useCallback(() => {
    const next = resolveAcousticProviderRuntimeConfig();
    setProviderRuntimeConfig(next);
    setProviderSaveState('idle');
    setProviderSaveError(null);
    setProviderHealthResult(null);
    onRefreshAcousticProviderState?.();
  }, [onRefreshAcousticProviderState]);

  const handleSaveProviderConfig = useCallback(() => {
    try {
      const persisted = persistAcousticProviderRuntimeConfig(providerRuntimeConfig);
      setProviderRuntimeConfig(persisted);
      setProviderSaveState('saved');
      setProviderSaveError(null);
      setProviderHealthResult(null);
      onRefreshAcousticProviderState?.();
    } catch (error) {
      setProviderSaveState('error');
      setProviderSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [onRefreshAcousticProviderState, providerRuntimeConfig]);

  const handleCheckProviderHealth = useCallback(async () => {
    const requestSeq = providerHealthRequestSeqRef.current + 1;
    providerHealthRequestSeqRef.current = requestSeq;
    providerHealthAbortRef.current?.abort();
    const controller = new AbortController();
    providerHealthAbortRef.current = controller;
    setProviderHealthChecking(true);

    try {
      const result = await probeExternalAcousticProviderHealth({
        runtimeConfig: providerRuntimeConfig,
        signal: controller.signal,
      });
      if (providerHealthRequestSeqRef.current !== requestSeq || controller.signal.aborted) {
        return;
      }
      setProviderHealthResult(result);
    } finally {
      if (providerHealthRequestSeqRef.current === requestSeq) {
        setProviderHealthChecking(false);
      }
      if (providerHealthAbortRef.current === controller) {
        providerHealthAbortRef.current = null;
      }
    }
  }, [providerRuntimeConfig]);

  useEffect(() => () => {
    providerHealthAbortRef.current?.abort();
  }, []);

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
  const acousticRuntimeLabel = acousticRuntimeStatus?.state === 'loading'
    ? tf(locale, 'ai.acoustic.runtimeProgressLoading', {
      progress: Math.round((acousticRuntimeStatus.progressRatio ?? 0) * 100),
      processedFrames: acousticRuntimeStatus.processedFrames ?? 0,
      totalFrames: acousticRuntimeStatus.totalFrames ?? 0,
    })
    : acousticRuntimeStatus?.state === 'ready'
      ? t(locale, 'ai.acoustic.runtimeProgressReady')
      : acousticRuntimeStatus?.state === 'error'
        ? t(locale, 'ai.acoustic.runtimeProgressFailed')
        : t(locale, 'ai.stats.acousticUnavailable');
  const acousticRuntimeErrorMessage = acousticRuntimeStatus?.state === 'error'
    ? acousticRuntimeStatus.errorMessage ?? null
    : null;
  const acousticRuntimeErrorSummary = acousticRuntimeStatus?.state === 'error'
    ? t(locale, 'ai.acoustic.runtimeErrorHint')
    : null;
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
  const acousticComparisonDetail = acousticDetailFullMedia ?? acousticDetail;
  const acousticDescriptorFrame = useMemo(() => {
    if (!acousticComparisonDetail) return null;
    return findNearestFrameByTime(acousticComparisonDetail.frames, acousticInspector?.timeSec);
  }, [acousticComparisonDetail, acousticInspector?.timeSec]);
  const pinnedDescriptorFrame = useMemo(() => {
    if (!acousticComparisonDetail) return null;
    return findNearestFrameByTime(acousticComparisonDetail.frames, pinnedInspector?.timeSec);
  }, [acousticComparisonDetail, pinnedInspector?.timeSec]);
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

  const exportTargetDetail = exportScope === 'full_media'
    ? (acousticDetailFullMedia ?? acousticDetail)
    : exportScope === 'selection'
      ? acousticDetail
      : null;
  const exportBatchDetails = acousticBatchDetails ?? [];
  const batchSelectionCount = acousticBatchSelectionCount ?? exportBatchDetails.length;
  const droppedBatchRanges = acousticBatchDroppedSelectionRanges ?? [];
  const batchSkippedCount = droppedBatchRanges.length;
  const droppedBatchLabels = droppedBatchRanges
    .map((item) => item.selectionLabel ?? item.selectionId)
    .slice(0, 8);
  const droppedBatchLabelText = droppedBatchLabels.join(', ');
  const isBatchExportScope = exportScope === 'batch_selection';
  const canExportBatch = exportBatchDetails.length > 1;
  const providerSaveMessage = providerSaveState === 'saved'
    ? t(locale, 'ai.acoustic.providerSaved')
    : providerSaveState === 'error'
      ? (providerSaveError ?? t(locale, 'ai.acoustic.providerSaveFailed'))
      : null;
  const providerHealthLabelMap: Record<ExternalAcousticProviderHealthCheckResult['state'], string> = {
    available: t(locale, 'ai.acoustic.providerHealthAvailable'),
    disabled: t(locale, 'ai.acoustic.providerHealthDisabled'),
    unconfigured: t(locale, 'ai.acoustic.providerHealthUnconfigured'),
    aborted: t(locale, 'ai.acoustic.providerHealthAborted'),
    unauthorized: t(locale, 'ai.acoustic.providerHealthUnauthorized'),
    forbidden: t(locale, 'ai.acoustic.providerHealthForbidden'),
    timeout: t(locale, 'ai.acoustic.providerHealthTimeout'),
    'network-error': t(locale, 'ai.acoustic.providerHealthNetworkError'),
    'http-error': t(locale, 'ai.acoustic.providerHealthHttpError'),
    'unknown-error': t(locale, 'ai.acoustic.providerHealthUnknownError'),
  };
  const providerHealthLabel = providerHealthChecking
    ? t(locale, 'ai.acoustic.providerHealthChecking')
    : providerHealthResult
      ? providerHealthLabelMap[providerHealthResult.state]
      : t(locale, 'ai.acoustic.providerHealthIdle');
  const providerHealthLatencyLabel = providerHealthResult?.latencyMs != null
    ? tf(locale, 'ai.acoustic.providerHealthLatency', { latencyMs: String(providerHealthResult.latencyMs) })
    : null;
  const providerHealthMeta = providerHealthResult
    ? providerHealthResult.state === 'available'
      ? providerHealthLatencyLabel
      : providerHealthResult.message ?? providerHealthLatencyLabel
    : null;
  const providerConfigured = acousticProviderState?.reachability.available ?? false;

  useEffect(() => {
    if (exportScope !== 'batch_selection' || canExportBatch) return;
    setExportScope(acousticDetail ? 'selection' : 'full_media');
  }, [acousticDetail, canExportBatch, exportScope]);

  const handleExportAcoustic = async (format: AcousticExportFormat) => {
    if (acousticExporting) return;

    const scope: 'single' | 'batch' = isBatchExportScope ? 'batch' : 'single';
    if (scope === 'batch') {
      if (!canExportBatch) return;
      if (format === 'pitchtier') return;
    } else if (!exportTargetDetail) {
      return;
    }

    const payload = scope === 'batch'
      ? exportBatchDetails
      : exportTargetDetail;
    if (!payload) return;

    const payloadStats = measureAcousticExportPayloadStats(scope, payload);
    const rejectedPayload = shouldRejectAcousticExportPayload(payloadStats);
    if (rejectedPayload) {
      const estimatedMiB = Math.max(1, Math.round(rejectedPayload.estimatedBytes / (1024 * 1024)));
      setAcousticExportError(`Export payload is too large (~${estimatedMiB} MB / ${rejectedPayload.frameCount} frames). Narrow the export scope and retry.`);
      return;
    }

    const stem = scope === 'batch'
      ? buildAcousticBatchExportFileStem(exportBatchDetails)
      : buildAcousticExportFileStem(exportTargetDetail!);

    setAcousticExporting(true);
    setAcousticExportError(null);
    try {
      let content: string | null = null;
      try {
        content = await serializeAcousticExportWithWorker(scope, format, payload);
      } catch {
        content = serializeAcousticExportSync(scope, format, payload);
      }
      if (content == null) return;
      downloadTextPayload(
        resolveAcousticExportFilename(stem, format),
        content,
        resolveAcousticExportMimeType(format),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAcousticExportError(`Export failed: ${message}`);
    } finally {
      setAcousticExporting(false);
    }
  };

  return (
    <div className="pnl-analysis-panel panel-design-match-content" data-ai-analysis-panel="true">
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
                <div className="transcription-analysis-acoustic-empty">
                  {acousticRuntimeStatus?.state === 'loading'
                    ? acousticRuntimeLabel
                    : t(locale, 'ai.stats.acousticUnavailableHint')}
                </div>
              )}
            </PanelSection>
          )}
          {activeTab === 'acoustic' && (acousticDetail || acousticRuntimeStatus?.state === 'loading' || acousticRuntimeStatus?.state === 'ready' || acousticRuntimeStatus?.state === 'error') ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-runtime-section"
              title={t(locale, 'ai.acoustic.runtimeTitle')}
              description={t(locale, 'ai.acoustic.runtimeDescription')}
            >
              <div className="transcription-analysis-acoustic-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeAlgorithm')}</span>
                  <span className="transcription-analysis-stats-value">{acousticDetail?.algorithmVersion ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeSampleRate')}</span>
                  <span className="transcription-analysis-stats-value">{typeof acousticDetail?.sampleRate === 'number' ? `${acousticDetail.sampleRate} Hz` : t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeWindow')}</span>
                  <span className="transcription-analysis-stats-value">{typeof acousticDetail?.analysisWindowSec === 'number' && typeof acousticDetail?.frameStepSec === 'number' ? `${acousticDetail.analysisWindowSec.toFixed(3)}s / ${acousticDetail.frameStepSec.toFixed(3)}s` : t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeThreshold')}</span>
                  <span className="transcription-analysis-stats-value">{typeof acousticDetail?.yinThreshold === 'number' && typeof acousticDetail?.silenceRmsThreshold === 'number' ? `YIN ${acousticDetail.yinThreshold.toFixed(2)} · RMS ${acousticDetail.silenceRmsThreshold.toFixed(3)}` : t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeProgress')}</span>
                  <span className="transcription-analysis-stats-value">{acousticRuntimeLabel}</span>
                </div>
                {acousticRuntimeErrorSummary ? (
                  <p className="transcription-analysis-acoustic-export-note">{acousticRuntimeErrorSummary}</p>
                ) : null}
                {acousticRuntimeErrorMessage ? (
                  <details className="transcription-analysis-acoustic-export-note">
                    <summary>{t(locale, 'ai.acoustic.runtimeErrorDetails')}</summary>
                    <p className="transcription-analysis-acoustic-export-note">{acousticRuntimeErrorMessage}</p>
                  </details>
                ) : null}
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.runtimeVad')}</span>
                  <span className="transcription-analysis-stats-value">{vadCacheLabel}</span>
                </div>
                {/* ── Wave B: Parameter presets ── */}
                {onChangeAcousticConfig ? (
                  <div className="transcription-analysis-acoustic-param-presets">
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.paramPreset')}</span>
                      <span className="transcription-analysis-stats-value">
                        <select
                          className="transcription-analysis-acoustic-preset-select"
                          value={activePreset}
                          onChange={(event) => handlePresetChange(event.target.value as AcousticAnalysisPresetKey)}
                        >
                          {ACOUSTIC_ANALYSIS_PRESETS.map((preset) => (
                            <option key={preset.key} value={preset.key} disabled={preset.key === 'custom'}>{preset.label}</option>
                          ))}
                        </select>
                      </span>
                    </div>
                    {activePreset === 'custom' ? (
                      <div className="transcription-analysis-stats-row">
                        <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.paramOverride')}</span>
                        <span className="transcription-analysis-stats-value">
                          <PanelChip variant="warning">{t(locale, 'ai.acoustic.paramCustomActive')}</PanelChip>
                        </span>
                      </div>
                    ) : null}
                    <div className="transcription-analysis-acoustic-param-grid">
                      <label className="transcription-analysis-acoustic-param-field">
                        <span>{t(locale, 'ai.acoustic.paramPitchFloor')}</span>
                        <input
                          className="transcription-analysis-acoustic-param-input"
                          type="number"
                          min={30}
                          max={500}
                          step={1}
                          value={effectiveDraftAcousticConfig.pitchFloorHz}
                          onChange={handleNumericConfigChange('pitchFloorHz')}
                        />
                      </label>
                      <label className="transcription-analysis-acoustic-param-field">
                        <span>{t(locale, 'ai.acoustic.paramPitchCeiling')}</span>
                        <input
                          className="transcription-analysis-acoustic-param-input"
                          type="number"
                          min={80}
                          max={1200}
                          step={1}
                          value={effectiveDraftAcousticConfig.pitchCeilingHz}
                          onChange={handleNumericConfigChange('pitchCeilingHz')}
                        />
                      </label>
                      <label className="transcription-analysis-acoustic-param-field">
                        <span>{t(locale, 'ai.acoustic.paramWindow')}</span>
                        <input
                          className="transcription-analysis-acoustic-param-input"
                          type="number"
                          min={0.01}
                          max={0.12}
                          step={0.001}
                          value={effectiveDraftAcousticConfig.analysisWindowSec}
                          onChange={handleNumericConfigChange('analysisWindowSec')}
                        />
                      </label>
                      <label className="transcription-analysis-acoustic-param-field">
                        <span>{t(locale, 'ai.acoustic.paramFrameStep')}</span>
                        <input
                          className="transcription-analysis-acoustic-param-input"
                          type="number"
                          min={0.002}
                          max={0.04}
                          step={0.001}
                          value={effectiveDraftAcousticConfig.frameStepSec}
                          onChange={handleNumericConfigChange('frameStepSec')}
                        />
                      </label>
                      <label className="transcription-analysis-acoustic-param-field">
                        <span>{t(locale, 'ai.acoustic.paramSilenceThreshold')}</span>
                        <input
                          className="transcription-analysis-acoustic-param-input"
                          type="number"
                          min={0.001}
                          max={0.2}
                          step={0.001}
                          value={effectiveDraftAcousticConfig.silenceRmsThreshold}
                          onChange={handleNumericConfigChange('silenceRmsThreshold')}
                        />
                      </label>
                    </div>
                    {onChangeAcousticConfig || onResetAcousticConfig ? (
                      <div className="transcription-analysis-acoustic-inspector-actions">
                        <button
                          type="button"
                          className="transcription-analysis-acoustic-nav-btn"
                          onClick={handleResetAcousticConfigDraft}
                        >
                          {t(locale, 'ai.acoustic.paramResetDraft')}
                        </button>
                        <button
                          type="button"
                          className="transcription-analysis-acoustic-nav-btn"
                          onClick={handleApplyAcousticConfig}
                          disabled={
                            !hasPendingAcousticConfigChanges
                            || (!draftAcousticConfigOverride && !onResetAcousticConfig)
                            || (Boolean(draftAcousticConfigOverride) && !onChangeAcousticConfig)
                          }
                        >
                          {t(locale, 'ai.acoustic.paramApply')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-inspector-section"
              title={t(locale, 'ai.acoustic.inspectorTitle')}
              description={t(locale, 'ai.acoustic.inspectorDescription')}
            >
              {acousticInspector || pinnedInspector ? (
                <div className="transcription-analysis-acoustic-panel">
                  {/* ── Live inspector readout ── */}
                  {acousticInspector ? (
                    <>
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
                    </>
                  ) : null}
                  {/* ── Pin/Unpin controls ── */}
                  <div className="transcription-analysis-acoustic-inspector-actions">
                    {onPinInspector && acousticInspector ? (
                      <button
                        type="button"
                        className="transcription-analysis-acoustic-nav-btn"
                        onClick={onPinInspector}
                      >
                        {pinnedInspector ? t(locale, 'ai.acoustic.inspectorUpdatePin') : t(locale, 'ai.acoustic.inspectorPin')}
                      </button>
                    ) : null}
                    {onClearPinnedInspector && pinnedInspector ? (
                      <button
                        type="button"
                        className="transcription-analysis-acoustic-nav-btn"
                        onClick={onClearPinnedInspector}
                      >
                        {t(locale, 'ai.acoustic.inspectorUnpin')}
                      </button>
                    ) : null}
                  </div>
                  {/* ── Pinned (frozen) inspector readout ── */}
                  {pinnedInspector ? (
                    <div className="transcription-analysis-acoustic-pinned-readout">
                      <div className="transcription-analysis-stats-row transcription-analysis-stats-row-accent">
                        <span className="transcription-analysis-stats-label transcription-analysis-stats-label-accent">
                          {t(locale, 'ai.acoustic.pinnedLabel')}
                        </span>
                        <span className="transcription-analysis-stats-value">{pinnedInspector.timeSec.toFixed(2)}s</span>
                      </div>
                      <div className="transcription-analysis-stats-row">
                        <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticF0')}</span>
                        <span className="transcription-analysis-stats-value">{formatHz(pinnedInspector.f0Hz) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                      </div>
                      <div className="transcription-analysis-stats-row">
                        <span className="transcription-analysis-stats-label">{t(locale, 'ai.stats.acousticIntensityPeak')}</span>
                        <span className="transcription-analysis-stats-value">{formatDb(pinnedInspector.intensityDb) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                      </div>
                      {/* ── Dual-point comparison (live vs pinned) ── */}
                      {acousticInspector ? (
                        <div className="transcription-analysis-acoustic-comparison">
                          <div className="transcription-analysis-stats-row">
                            <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.comparisonDeltaTime')}</span>
                            <span className="transcription-analysis-stats-value">{(acousticInspector.timeSec - pinnedInspector.timeSec).toFixed(3)}s</span>
                          </div>
                          <div className="transcription-analysis-stats-row">
                            <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.comparisonDeltaF0')}</span>
                            <span className="transcription-analysis-stats-value">
                              {typeof acousticInspector.f0Hz === 'number' && typeof pinnedInspector.f0Hz === 'number'
                                ? `${(acousticInspector.f0Hz - pinnedInspector.f0Hz).toFixed(1)} Hz`
                                : t(locale, 'ai.stats.acousticUnavailable')}
                            </span>
                          </div>
                          <div className="transcription-analysis-stats-row">
                            <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.comparisonDeltaIntensity')}</span>
                            <span className="transcription-analysis-stats-value">
                              {typeof acousticInspector.intensityDb === 'number' && typeof pinnedInspector.intensityDb === 'number'
                                ? `${(acousticInspector.intensityDb - pinnedInspector.intensityDb).toFixed(1)} dB`
                                : t(locale, 'ai.stats.acousticUnavailable')}
                            </span>
                          </div>
                          <div className="transcription-analysis-stats-row">
                            <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.comparisonDeltaSpectralCentroid')}</span>
                            <span className="transcription-analysis-stats-value">
                              {formatDelta(acousticDescriptorFrame?.spectralCentroidHz, pinnedDescriptorFrame?.spectralCentroidHz, 'Hz', 0)
                                ?? t(locale, 'ai.stats.acousticUnavailable')}
                            </span>
                          </div>
                          <div className="transcription-analysis-stats-row">
                            <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.comparisonDeltaSpectralRolloff')}</span>
                            <span className="transcription-analysis-stats-value">
                              {formatDelta(acousticDescriptorFrame?.spectralRolloffHz, pinnedDescriptorFrame?.spectralRolloffHz, 'Hz', 0)
                                ?? t(locale, 'ai.stats.acousticUnavailable')}
                            </span>
                          </div>
                          <div className="transcription-analysis-stats-row">
                            <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.comparisonDeltaFormantF1')}</span>
                            <span className="transcription-analysis-stats-value">
                              {formatDelta(acousticDescriptorFrame?.formantF1Hz, pinnedDescriptorFrame?.formantF1Hz, 'Hz', 0)
                                ?? t(locale, 'ai.stats.acousticUnavailable')}
                            </span>
                          </div>
                          <div className="transcription-analysis-stats-row">
                            <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.comparisonDeltaFormantF2')}</span>
                            <span className="transcription-analysis-stats-value">
                              {formatDelta(acousticDescriptorFrame?.formantF2Hz, pinnedDescriptorFrame?.formantF2Hz, 'Hz', 0)
                                ?? t(locale, 'ai.stats.acousticUnavailable')}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {/* ── Hotspot match info ── */}
                  {acousticInspector ? (
                    <>
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
                            onClick={() => {
                              onSelectHotspot?.(acousticInspector.matchedHotspotTimeSec as number);
                              onJumpToAcousticHotspot(acousticInspector.matchedHotspotTimeSec as number);
                            }}
                          >
                            {t(locale, 'ai.acoustic.inspectorJumpHotspot')}
                          </button>
                        </div>
                      ) : null}
                    </>
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
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorFlatnessMean')}</span>
                  <span className="transcription-analysis-stats-value">{formatScalar(acousticSummary?.spectralFlatnessMean) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorLoudnessMean')}</span>
                  <span className="transcription-analysis-stats-value">{formatDb(acousticSummary?.loudnessMeanDb) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorMfccMean')}</span>
                  <span className="transcription-analysis-stats-value">{formatCoefficients(acousticSummary?.mfccMeanCoefficients) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
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
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorFlatnessCurrent')}</span>
                  <span className="transcription-analysis-stats-value">{formatScalar(acousticDescriptorFrame?.spectralFlatness) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorLoudnessCurrent')}</span>
                  <span className="transcription-analysis-stats-value">{formatDb(acousticDescriptorFrame?.loudnessDb) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.descriptorMfccCurrent')}</span>
                  <span className="transcription-analysis-stats-value">{formatCoefficients(acousticDescriptorFrame?.mfccCoefficients) ?? t(locale, 'ai.stats.acousticUnavailable')}</span>
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
              meta={acousticCalibrationStatus === 'calibrated'
                ? <PanelChip>{t(locale, 'ai.acoustic.formantCalibrated')}</PanelChip>
                : <PanelChip variant="warning">{t(locale, 'ai.acoustic.formantExploratory')}</PanelChip>}
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
                    const isSelectedHotspot = selectedHotspotTimeSec != null
                      && Math.abs(selectedHotspotTimeSec - hotspot.timeSec) <= 0.01;

                    return (
                      <button
                        key={`${hotspot.kind}-${hotspot.timeSec}`}
                        type="button"
                        className={`transcription-analysis-acoustic-hotspot transcription-analysis-acoustic-hotspot-detailed${isSelectedHotspot ? ' is-selected' : ''}`}
                        onClick={() => {
                          onSelectHotspot?.(hotspot.timeSec);
                          onJumpToAcousticHotspot?.(hotspot.timeSec);
                        }}
                        title={tf(locale, 'ai.stats.acousticHotspotJump', { kind: hotspotKindLabel[hotspot.kind], timeSec: hotspot.timeSec.toFixed(2) })}
                        aria-pressed={isSelectedHotspot}
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
                  onClick={() => {
                    onSelectHotspot?.(null);
                    onJumpToAcousticHotspot?.(acousticSummary.selectionStartSec);
                  }}
                  disabled={!onJumpToAcousticHotspot}
                >
                  {t(locale, 'ai.acoustic.jumpSelectionStart')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => {
                    onSelectHotspot?.(null);
                    onJumpToAcousticHotspot?.(acousticSummary.selectionEndSec);
                  }}
                  disabled={!onJumpToAcousticHotspot}
                >
                  {t(locale, 'ai.acoustic.jumpSelectionEnd')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => {
                    if (!topHotspot) return;
                    onSelectHotspot?.(topHotspot.timeSec);
                    onJumpToAcousticHotspot?.(topHotspot.timeSec);
                  }}
                  disabled={!onJumpToAcousticHotspot || !topHotspot}
                >
                  {t(locale, 'ai.acoustic.jumpTopHotspot')}
                </button>
              </div>
            </PanelSection>
          ) : null}
          {activeTab === 'acoustic' && (acousticDetail || acousticDetailFullMedia || canExportBatch) ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-export-section"
              title={t(locale, 'ai.acoustic.exportTitle')}
              description={t(locale, 'ai.acoustic.exportDescription')}
            >
              <div className="transcription-analysis-acoustic-export-scope">
                <button
                  type="button"
                  className={`transcription-analysis-acoustic-nav-btn ${exportScope === 'selection' ? 'is-active' : ''}`}
                  onClick={() => setExportScope('selection')}
                  disabled={acousticExporting}
                >
                  {t(locale, 'ai.acoustic.exportScopeSelection')}
                </button>
                <button
                  type="button"
                  className={`transcription-analysis-acoustic-nav-btn ${exportScope === 'full_media' ? 'is-active' : ''}`}
                  onClick={() => setExportScope('full_media')}
                  disabled={acousticExporting || !acousticDetailFullMedia}
                >
                  {t(locale, 'ai.acoustic.exportScopeFullMedia')}
                </button>
                <button
                  type="button"
                  className={`transcription-analysis-acoustic-nav-btn ${exportScope === 'batch_selection' ? 'is-active' : ''}`}
                  onClick={() => setExportScope('batch_selection')}
                  disabled={acousticExporting || !canExportBatch}
                >
                  {t(locale, 'ai.acoustic.exportScopeBatchSelection')}
                </button>
              </div>
              <div className="transcription-analysis-acoustic-export-actions">
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => {
                    void handleExportAcoustic('csv');
                  }}
                  disabled={acousticExporting || (isBatchExportScope ? !canExportBatch : !exportTargetDetail)}
                >
                  {t(locale, 'ai.acoustic.exportCsv')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => {
                    void handleExportAcoustic('json');
                  }}
                  disabled={acousticExporting || (isBatchExportScope ? !canExportBatch : !exportTargetDetail)}
                >
                  {t(locale, 'ai.acoustic.exportJson')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => {
                    void handleExportAcoustic('pitchtier');
                  }}
                  disabled={acousticExporting || isBatchExportScope || !exportTargetDetail}
                >
                  {t(locale, 'ai.acoustic.exportPitchTier')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => {
                    void handleExportAcoustic('json_research');
                  }}
                  disabled={acousticExporting || (isBatchExportScope ? !canExportBatch : !exportTargetDetail)}
                >
                  {t(locale, 'ai.acoustic.exportJsonResearch')}
                </button>
              </div>
                {isBatchExportScope ? (
                <p className="transcription-analysis-acoustic-export-note">
                  {tf(locale, 'ai.acoustic.exportBatchSelectionCount', { count: exportBatchDetails.length })}
                </p>
              ) : exportTargetDetail ? (
                <p className="transcription-analysis-acoustic-export-note">
                  {tf(locale, 'ai.acoustic.exportSampleCount', { count: exportTargetDetail.sampleCount })}
                </p>
              ) : null}
              {isBatchExportScope ? (
                <p className="transcription-analysis-acoustic-export-note">{t(locale, 'ai.acoustic.exportPitchTierBatchNote')}</p>
              ) : null}
                {batchSkippedCount > 0 ? (
                  <p className="transcription-analysis-acoustic-export-note">
                    {tf(locale, 'ai.acoustic.exportBatchSelectionSummary', {
                      selected: String(batchSelectionCount),
                      exported: String(exportBatchDetails.length),
                      skipped: String(batchSkippedCount),
                    })}
                  </p>
                ) : null}
                {batchSkippedCount > 0 && droppedBatchLabelText ? (
                  <p className="transcription-analysis-acoustic-export-note">
                    {tf(locale, 'ai.acoustic.exportBatchSelectionDropped', {
                      ids: droppedBatchLabelText,
                    })}
                  </p>
                ) : null}
              {acousticExportError ? (
                <p className="transcription-analysis-acoustic-export-note" role="status">
                  {acousticExportError}
                </p>
              ) : null}
              <p className="transcription-analysis-acoustic-export-note">{t(locale, 'ai.acoustic.exportBackendNote')}</p>
            </PanelSection>
          ) : null}
          {/* ── Wave E: Provider extension section ── */}
          {activeTab === 'acoustic' ? (
            <PanelSection
              className="transcription-analysis-acoustic-section transcription-analysis-acoustic-provider-section"
              title={t(locale, 'ai.acoustic.providerTitle')}
              description={t(locale, 'ai.acoustic.providerDescription')}
            >
              <div className="transcription-analysis-acoustic-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.providerDefault')}</span>
                  <span className="transcription-analysis-stats-value">
                    <PanelChip>{acousticProviderState?.effectiveProviderId ?? 'local-yin-spectral'}</PanelChip>
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.providerEnhanced')}</span>
                  <span className="transcription-analysis-stats-value">
                    {onChangeAcousticProvider ? (
                      <select
                        className="transcription-analysis-acoustic-preset-select"
                        value={acousticProviderPreference ?? PROVIDER_PREFERENCE_AUTO}
                        onChange={(event) => onChangeAcousticProvider(event.target.value === PROVIDER_PREFERENCE_AUTO ? null : event.target.value)}
                      >
                        <option value={PROVIDER_PREFERENCE_AUTO}>{t(locale, 'ai.acoustic.providerAuto')}</option>
                        {acousticProviderDefinitions.map((provider) => (
                          <option key={provider.id} value={provider.id}>{provider.label}</option>
                        ))}
                      </select>
                    ) : t(locale, 'ai.acoustic.providerNoneConfigured')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.providerRoutingStrategy')}</span>
                  <span className="transcription-analysis-stats-value">
                    <select
                      className="transcription-analysis-acoustic-preset-select"
                      value={providerRuntimeConfig.routingStrategy}
                      onChange={handleProviderRoutingStrategyChange}
                    >
                      <option value="local-first">{t(locale, 'ai.acoustic.providerRoutingLocalFirst')}</option>
                      <option value="prefer-external">{t(locale, 'ai.acoustic.providerRoutingPreferExternal')}</option>
                    </select>
                  </span>
                </div>
                <div className="transcription-analysis-acoustic-param-grid transcription-analysis-acoustic-provider-grid">
                  <label className="transcription-analysis-acoustic-provider-toggle">
                    <input
                      type="checkbox"
                      checked={providerRuntimeConfig.externalProvider.enabled}
                      onChange={handleProviderExternalEnabledChange}
                    />
                    <span>{t(locale, 'ai.acoustic.providerExternalEnabled')}</span>
                  </label>
                  <label className="transcription-analysis-acoustic-param-field">
                    <span>{t(locale, 'ai.acoustic.providerTimeoutMs')}</span>
                    <input
                      className="transcription-analysis-acoustic-param-input"
                      type="number"
                      min={500}
                      max={120000}
                      step={100}
                      value={providerRuntimeConfig.externalProvider.timeoutMs}
                      onChange={handleProviderTimeoutChange}
                    />
                  </label>
                  <label className="transcription-analysis-acoustic-param-field transcription-analysis-acoustic-provider-field-wide">
                    <span>{t(locale, 'ai.acoustic.providerEndpoint')}</span>
                    <input
                      className="transcription-analysis-acoustic-param-input"
                      type="url"
                      placeholder="https://example.com/acoustic/analyze"
                      value={providerRuntimeConfig.externalProvider.endpoint ?? ''}
                      onChange={handleProviderEndpointChange}
                    />
                  </label>
                  <label className="transcription-analysis-acoustic-param-field transcription-analysis-acoustic-provider-field-wide">
                    <span>{t(locale, 'ai.acoustic.providerApiKey')}</span>
                    <input
                      className="transcription-analysis-acoustic-param-input"
                      type="password"
                      value={providerRuntimeConfig.externalProvider.apiKey ?? ''}
                      onChange={handleProviderApiKeyChange}
                    />
                  </label>
                </div>
                <div className="transcription-analysis-acoustic-inspector-actions">
                  <button
                    type="button"
                    className="transcription-analysis-acoustic-nav-btn"
                    onClick={handleSaveProviderConfig}
                  >
                    {t(locale, 'ai.acoustic.providerSave')}
                  </button>
                  <button
                    type="button"
                    className="transcription-analysis-acoustic-nav-btn"
                    onClick={handleReloadProviderConfig}
                  >
                    {t(locale, 'ai.acoustic.providerReload')}
                  </button>
                  <button
                    type="button"
                    className="transcription-analysis-acoustic-nav-btn"
                    onClick={() => { void handleCheckProviderHealth(); }}
                    disabled={providerHealthChecking}
                  >
                    {t(locale, 'ai.acoustic.providerCheckHealth')}
                  </button>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.providerStatus')}</span>
                  <span className="transcription-analysis-stats-value">
                    {providerConfigured
                      ? t(locale, 'ai.acoustic.providerStatusAvailable')
                      : t(locale, 'ai.acoustic.providerStatusUnavailable')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">{t(locale, 'ai.acoustic.providerHealthLabel')}</span>
                  <span className="transcription-analysis-stats-value">{providerHealthLabel}</span>
                </div>
                {providerHealthMeta ? (
                  <p className="transcription-analysis-acoustic-export-note">{providerHealthMeta}</p>
                ) : null}
                {acousticProviderState?.fellBackToLocal ? (
                  <p className="transcription-analysis-acoustic-export-note">
                    {acousticProviderState.fallbackReason ?? t(locale, 'ai.acoustic.providerNote')}
                  </p>
                ) : null}
                {providerHealthResult?.state === 'unauthorized' || providerHealthResult?.state === 'forbidden' ? (
                  <p className="transcription-analysis-acoustic-export-note">{t(locale, 'ai.acoustic.providerAuthHint')}</p>
                ) : null}
                {providerSaveMessage ? (
                  <p className="transcription-analysis-acoustic-export-note">{providerSaveMessage}</p>
                ) : null}
                <p className="transcription-analysis-acoustic-export-note">{t(locale, 'ai.acoustic.providerNote')}</p>
              </div>
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
