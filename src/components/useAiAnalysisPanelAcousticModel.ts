import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { t, tf, useLocale } from '../i18n';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import {
  buildAcousticBatchExportFileStem,
  buildAcousticExportFileStem,
  buildAcousticInspectorSlice,
} from '../utils/acousticPanelDetail';
import {
  DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
  type AcousticAnalysisConfig,
} from '../utils/acousticOverlayTypes';
import {
  ACOUSTIC_ANALYSIS_PRESETS,
  type AcousticAnalysisPresetKey,
} from '../utils/acousticAnalysisPresets';
import {
  ACOUSTIC_NUMERIC_BOUNDS,
  areAcousticConfigOverridesEqual,
  buildNormalizedPath,
  downloadTextPayload,
  findNearestFrameByTime,
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
  persistAcousticProviderRuntimeConfig,
  probeExternalAcousticProviderHealth,
  resolveAcousticProviderRuntimeConfig,
  type AcousticProviderRuntimeConfig,
  type ExternalAcousticProviderHealthCheckResult,
} from '../services/acoustic/acousticProviderContract';
import { buildAiAnalysisAcousticLabelMaps } from './aiAnalysisPanelAcousticLabelMaps';
import { buildVowelSpacePointsFromAcousticDetail } from './aiAnalysisPanelVowelSpacePoints';

type ProviderConfigSaveState = 'idle' | 'saved' | 'error';

export function useAiAnalysisPanelAcousticModel(panel: AiPanelContextValue) {
  const locale = useLocale();
  const {
    acousticSummary,
    acousticRuntimeStatus,
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
  } = panel;

  const [activePreset, setActivePreset] = useState<AcousticAnalysisPresetKey>('default');
  const [draftAcousticConfigOverride, setDraftAcousticConfigOverride] =
    useState<AcousticConfigOverride>(() => acousticConfigOverride ?? null);
  const [exportScope, setExportScope] = useState<'selection' | 'full_media' | 'batch_selection'>(
    'selection',
  );
  const [providerRuntimeConfig, setProviderRuntimeConfig] = useState<AcousticProviderRuntimeConfig>(
    () => resolveAcousticProviderRuntimeConfig(),
  );
  const [providerSaveState, setProviderSaveState] = useState<ProviderConfigSaveState>('idle');
  const [providerSaveError, setProviderSaveError] = useState<string | null>(null);
  const [providerHealthChecking, setProviderHealthChecking] = useState(false);
  const [providerHealthResult, setProviderHealthResult] =
    useState<ExternalAcousticProviderHealthCheckResult | null>(null);
  const [acousticExporting, setAcousticExporting] = useState(false);
  const [acousticExportError, setAcousticExportError] = useState<string | null>(null);
  const providerHealthAbortRef = useRef<AbortController | null>(null);
  const providerHealthRequestSeqRef = useRef(0);

  const effectiveDraftAcousticConfig = useMemo<AcousticAnalysisConfig>(
    () => ({
      ...DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
      ...(draftAcousticConfigOverride ?? {}),
    }),
    [draftAcousticConfigOverride],
  );
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

  const handleNumericConfigChange = useCallback(
    (
      key: keyof Pick<
        AcousticAnalysisConfig,
        | 'pitchFloorHz'
        | 'pitchCeilingHz'
        | 'analysisWindowSec'
        | 'frameStepSec'
        | 'silenceRmsThreshold'
      >,
    ) =>
      (event: ChangeEvent<HTMLInputElement>) => {
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
      },
    [effectiveDraftAcousticConfig],
  );

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
  }, [
    draftAcousticConfigOverride,
    hasPendingAcousticConfigChanges,
    onChangeAcousticConfig,
    onResetAcousticConfig,
  ]);

  const handleProviderRoutingStrategyChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextStrategy =
        event.target.value === 'prefer-external' ? 'prefer-external' : 'local-first';
      setProviderRuntimeConfig((previous) => ({
        ...previous,
        routingStrategy: nextStrategy,
      }));
      setProviderSaveState('idle');
      setProviderSaveError(null);
    },
    [],
  );

  const handleProviderExternalEnabledChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
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
    },
    [],
  );

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

  useEffect(
    () => () => {
      providerHealthAbortRef.current?.abort();
    },
    [],
  );

  const acousticRuntimeLabel =
    acousticRuntimeStatus?.state === 'loading'
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
  const acousticRuntimeErrorMessage =
    acousticRuntimeStatus?.state === 'error' ? (acousticRuntimeStatus.errorMessage ?? null) : null;
  const acousticRuntimeErrorSummary =
    acousticRuntimeStatus?.state === 'error' ? t(locale, 'ai.acoustic.runtimeErrorHint') : null;
  const {
    hotspotKindLabel,
    hotspotExplanation,
    diagnosticLabel,
    trendLabel,
    providerHealthLabelMap,
  } = useMemo(() => buildAiAnalysisAcousticLabelMaps(locale), [locale]);
  const acousticDurationSec =
    acousticSummary?.durationSec ??
    (acousticSummary
      ? Math.max(acousticSummary.selectionEndSec - acousticSummary.selectionStartSec, 0)
      : null);
  const acousticVoicedRatio =
    acousticSummary?.voicedRatio ??
    (acousticSummary && acousticSummary.frameCount > 0
      ? acousticSummary.voicedFrameCount / acousticSummary.frameCount
      : null);
  const acousticHotspotCount =
    acousticSummary?.hotspotCount ?? acousticSummary?.hotspots?.length ?? 0;
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
  const vowelSpacePoints = useMemo(
    () => buildVowelSpacePointsFromAcousticDetail(acousticDetail),
    [acousticDetail],
  );
  const toneF0Path = useMemo(
    () => buildNormalizedPath(acousticDetail?.toneBins ?? [], 'normalizedF0'),
    [acousticDetail],
  );
  const toneIntensityPath = useMemo(
    () => buildNormalizedPath(acousticDetail?.toneBins ?? [], 'normalizedIntensity'),
    [acousticDetail],
  );
  const exportTargetDetail =
    exportScope === 'full_media'
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
  const providerSaveMessage =
    providerSaveState === 'saved'
      ? t(locale, 'ai.acoustic.providerSaved')
      : providerSaveState === 'error'
        ? (providerSaveError ?? t(locale, 'ai.acoustic.providerSaveFailed'))
        : null;
  const providerHealthLabel = providerHealthChecking
    ? t(locale, 'ai.acoustic.providerHealthChecking')
    : providerHealthResult
      ? providerHealthLabelMap[providerHealthResult.state]
      : t(locale, 'ai.acoustic.providerHealthIdle');
  const providerHealthLatencyLabel =
    providerHealthResult?.latencyMs != null
      ? tf(locale, 'ai.acoustic.providerHealthLatency', {
          latencyMs: String(providerHealthResult.latencyMs),
        })
      : null;
  const providerHealthMeta = providerHealthResult
    ? providerHealthResult.state === 'available'
      ? providerHealthLatencyLabel
      : (providerHealthResult.message ?? providerHealthLatencyLabel)
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

    const payload = scope === 'batch' ? exportBatchDetails : exportTargetDetail;
    if (!payload) return;

    const payloadStats = measureAcousticExportPayloadStats(scope, payload);
    const rejectedPayload = shouldRejectAcousticExportPayload(payloadStats);
    if (rejectedPayload) {
      const estimatedMiB = Math.max(1, Math.round(rejectedPayload.estimatedBytes / (1024 * 1024)));
      setAcousticExportError(
        `Export payload is too large (~${estimatedMiB} MB / ${rejectedPayload.frameCount} frames). Narrow the export scope and retry.`,
      );
      return;
    }

    const stem =
      scope === 'batch'
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

  return {
    locale,
    acousticSummary,
    acousticRuntimeStatus,
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
    activePreset,
    setActivePreset,
    draftAcousticConfigOverride,
    setDraftAcousticConfigOverride,
    exportScope,
    setExportScope,
    providerRuntimeConfig,
    setProviderRuntimeConfig,
    providerSaveState,
    setProviderSaveState,
    providerSaveError,
    setProviderSaveError,
    providerHealthChecking,
    setProviderHealthChecking,
    providerHealthResult,
    setProviderHealthResult,
    acousticExporting,
    setAcousticExporting,
    acousticExportError,
    setAcousticExportError,
    providerHealthAbortRef,
    providerHealthRequestSeqRef,
    effectiveDraftAcousticConfig,
    hasPendingAcousticConfigChanges,
    handlePresetChange,
    handleNumericConfigChange,
    handleResetAcousticConfigDraft,
    handleApplyAcousticConfig,
    handleProviderRoutingStrategyChange,
    handleProviderExternalEnabledChange,
    handleProviderEndpointChange,
    handleProviderApiKeyChange,
    handleProviderTimeoutChange,
    handleReloadProviderConfig,
    handleSaveProviderConfig,
    handleCheckProviderHealth,
    acousticRuntimeLabel,
    acousticRuntimeErrorMessage,
    acousticRuntimeErrorSummary,
    hotspotKindLabel,
    hotspotExplanation,
    diagnosticLabel,
    trendLabel,
    providerHealthLabelMap,
    acousticDurationSec,
    acousticVoicedRatio,
    acousticHotspotCount,
    topHotspot,
    acousticSlice,
    acousticComparisonDetail,
    acousticDescriptorFrame,
    pinnedDescriptorFrame,
    vowelSpacePoints,
    toneF0Path,
    toneIntensityPath,
    exportTargetDetail,
    exportBatchDetails,
    batchSelectionCount,
    droppedBatchRanges,
    batchSkippedCount,
    droppedBatchLabels,
    droppedBatchLabelText,
    isBatchExportScope,
    canExportBatch,
    providerSaveMessage,
    providerHealthLabel,
    providerHealthLatencyLabel,
    providerHealthMeta,
    providerConfigured,
    handleExportAcoustic,
  };
}

export type AiAnalysisPanelAcousticTabModel = ReturnType<typeof useAiAnalysisPanelAcousticModel>;
