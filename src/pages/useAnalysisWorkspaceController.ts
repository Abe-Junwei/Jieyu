import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { useAiPanelContextUpdater } from '../contexts/AiPanelContext';
import { t, useLocale } from '../i18n';
import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import {
  readAnalysisDeepLinkParams,
  resolveAnalysisWorkspaceScope,
} from '../utils/analysisUrlDeepLink';
import { formatTime } from '../utils/transcriptionFormatters';
import {
  buildTranscriptionDeepLinkHref,
  readTranscriptionWorkspaceReturnHint,
} from '../utils/transcriptionUrlDeepLink';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { createAnalysisRuntimeProps } from './TranscriptionPage.runtimeProps';
import type {
  TranscriptionPageAnalysisRuntimeProps,
  TranscriptionPageEmbeddingProviderConfig,
} from './TranscriptionPage.runtimeContracts';

const ANALYSIS_VISIBLE_TABS = ['embedding', 'stats'] as const;

function getUnitTextForLayer(unit: LayerUnitDocType): string {
  return unit.transcription?.default ?? '';
}

export function useAnalysisWorkspaceController() {
  const locale = useLocale();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setAiPanelContext = useAiPanelContextUpdater();
  const [embeddingProviderConfig, setEmbeddingProviderConfig] =
    useState<TranscriptionPageEmbeddingProviderConfig>(() => loadEmbeddingProviderConfig());

  const parsed = readAnalysisDeepLinkParams(searchParams);
  const hint = readTranscriptionWorkspaceReturnHint();
  const { textId, mediaId } = resolveAnalysisWorkspaceScope({
    urlTextId: parsed.textId,
    urlMediaId: parsed.mediaId,
    hint,
  });

  const unitsQuery = useQuery({
    queryKey: ['analysis-workspace-units', textId],
    queryFn: () => LinguisticService.units.listByTextId(textId),
    enabled: textId.length > 0,
  });

  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data]);
  const unitsOnCurrentMedia = useMemo(() => {
    if (mediaId.length === 0) return units;
    const scoped = units.filter((unit) => unit.mediaId === mediaId);
    return scoped.length > 0 ? scoped : units;
  }, [mediaId, units]);

  const selectedUnit = useMemo(() => {
    if (parsed.unitId.length > 0) {
      return (
        unitsOnCurrentMedia.find((unit) => unit.id === parsed.unitId) ??
        units.find((unit) => unit.id === parsed.unitId) ??
        null
      );
    }
    return unitsOnCurrentMedia[0] ?? null;
  }, [parsed.unitId, units, unitsOnCurrentMedia]);

  useEffect(() => {
    setAiPanelContext((previous) => ({
      ...previous,
      unitCount: unitsOnCurrentMedia.length,
    }));
  }, [setAiPanelContext, unitsOnCurrentMedia.length]);

  const handleJumpToUnit = useCallback(
    (unitId: string) => {
      const match = units.find((unit) => unit.id === unitId);
      const resolvedTextId =
        match?.textId !== undefined && match.textId.length > 0 ? match.textId : textId;
      if (resolvedTextId.length === 0) return;
      const resolvedMediaId =
        match?.mediaId !== undefined && match.mediaId.length > 0 ? match.mediaId : mediaId;
      void navigate(
        buildTranscriptionDeepLinkHref({
          textId: resolvedTextId,
          ...(resolvedMediaId.length > 0 ? { mediaId: resolvedMediaId } : {}),
          unitId,
        }),
      );
    },
    [mediaId, navigate, textId, units],
  );

  const handleJumpToCitation = useCallback(
    async (citationType: 'unit' | 'note' | 'pdf' | 'schema', refId: string) => {
      if (citationType === 'unit') {
        handleJumpToUnit(refId);
      }
    },
    [handleJumpToUnit],
  );

  const handleAnalysisTabChange = useCallback(
    (tab: 'embedding' | 'stats' | 'acoustic') => {
      const nextTab = tab === 'stats' ? 'stats' : 'embedding';
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('tab', nextTab);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleAutoFindSimilarConsumed = useCallback(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('intent');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const analysisRuntimeProps = useMemo<TranscriptionPageAnalysisRuntimeProps>(
    () => ({
      panel: {
        locale,
        analysisTab: parsed.tab,
        onAnalysisTabChange: handleAnalysisTabChange,
        visibleTabs: [...ANALYSIS_VISIBLE_TABS],
      },
      ...createAnalysisRuntimeProps({
        selectedUnit,
        unitsOnCurrentMedia,
        getUnitTextForLayer,
        formatTime,
        onJumpToCitation: handleJumpToCitation,
        onJumpToEmbeddingMatch: handleJumpToUnit,
        embeddingProviderConfig,
        onEmbeddingProviderConfigChange: setEmbeddingProviderConfig,
        externalErrorMessage: unitsQuery.error instanceof Error ? unitsQuery.error.message : null,
        autoFindSimilar: parsed.autoFindSimilar,
        onAutoFindSimilarConsumed: handleAutoFindSimilarConsumed,
      }),
    }),
    [
      embeddingProviderConfig,
      handleAnalysisTabChange,
      handleAutoFindSimilarConsumed,
      handleJumpToCitation,
      handleJumpToUnit,
      locale,
      parsed.autoFindSimilar,
      parsed.tab,
      selectedUnit,
      unitsOnCurrentMedia,
      unitsQuery.error,
    ],
  );

  const loadError =
    unitsQuery.error instanceof Error
      ? unitsQuery.error.message
      : unitsQuery.error
        ? t(locale, 'workspace.analysis.errorPrefix')
        : '';

  return {
    textId,
    mediaId,
    selectedUnit,
    unitCount: unitsOnCurrentMedia.length,
    isEmpty: textId.length === 0,
    isLoading: textId.length > 0 && unitsQuery.isLoading,
    loadError,
    analysisRuntimeProps,
  };
}
