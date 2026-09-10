import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { t, useLocale } from '../i18n';
import {
  readAnalysisDeepLinkParams,
  resolveAnalysisWorkspaceScope,
} from '../utils/analysisUrlDeepLink';
import { formatTime } from '../utils/transcriptionFormatters';
import {
  buildTranscriptionDeepLinkHref,
  buildTranscriptionWorkspaceReturnHref,
  readTranscriptionWorkspaceReturnHint,
} from '../utils/transcriptionUrlDeepLink';
import { writeCorpusWorksetClipboard } from './corpusWorksetClipboard';
import {
  buildCorpusWorksetExportPayload,
  formatCorpusWorksetMarkdown,
  formatCorpusWorksetPlain,
  toCorpusWorksetExportUnit,
  type CorpusWorksetExportPayload,
} from './corpusWorksetExport';
import {
  readCorpusBasketSession,
  syncCorpusBasketScope,
  toggleCorpusBasketUnit,
} from './corpusBasketSession';
import { readCorpusViewState, writeCorpusViewState } from './corpusViewState';

export type CorpusLibraryRow = {
  id: string;
  text: string;
  timeLabel: string;
  mediaLabel: string;
  selected: boolean;
  transcriptionHref: string;
};

export function useCorpusLibraryController() {
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const [basketRevision, setBasketRevision] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'empty' | 'unavailable'>('idle');

  const parsed = readAnalysisDeepLinkParams(searchParams);
  const hint = readTranscriptionWorkspaceReturnHint();
  const { textId, mediaId } = resolveAnalysisWorkspaceScope({
    urlTextId: parsed.textId,
    urlMediaId: parsed.mediaId,
    hint,
  });
  const scopeKey = textId;

  syncCorpusBasketScope(textId);

  const [filterState, setFilterState] = useState(() => ({
    scopeKey,
    text: readCorpusViewState().filterText ?? '',
  }));
  if (filterState.scopeKey !== scopeKey) {
    writeCorpusViewState({});
    setFilterState({ scopeKey, text: '' });
  }

  const unitsQuery = useQuery({
    queryKey: ['corpus-library-index', textId],
    queryFn: () => LinguisticService.units.listCorpusIndexByTextId(textId),
    enabled: textId.length > 0,
  });

  const derived = useMemo(() => {
    void basketRevision;
    const units = unitsQuery.data ?? [];
    const filterText = filterState.scopeKey === scopeKey ? filterState.text : '';
    const needle = filterText.trim().toLowerCase();
    const basketUnitIds = readCorpusBasketSession().unitIds;
    const selectedIds = new Set(basketUnitIds);
    const exportUnits = units.map((unit) =>
      toCorpusWorksetExportUnit({
        id: unit.id,
        ...(unit.textId.length > 0 ? { textId: unit.textId } : {}),
        ...(unit.mediaId.length > 0 ? { mediaId: unit.mediaId } : {}),
        ...(unit.layerId.length > 0 ? { layerId: unit.layerId } : {}),
        startTime: unit.startTime,
        endTime: unit.endTime,
        text: unit.defaultText,
        fallbackTextId: textId,
        fallbackMediaId: mediaId,
      }),
    );
    const exportPayload = buildCorpusWorksetExportPayload({
      textId,
      mediaId,
      basketUnitIds,
      units: exportUnits,
    });
    const filtered =
      needle.length === 0
        ? units
        : units.filter((unit) => {
            const haystack = `${unit.defaultText} ${unit.id} ${unit.mediaId}`.toLowerCase();
            return haystack.includes(needle);
          });
    const rows: CorpusLibraryRow[] = filtered.map((unit) => {
      const resolvedTextId = unit.textId.length > 0 ? unit.textId : textId;
      const resolvedMediaId = unit.mediaId.length > 0 ? unit.mediaId : mediaId;
      return {
        id: unit.id,
        text: unit.defaultText,
        timeLabel: formatTime(unit.startTime),
        mediaLabel: resolvedMediaId,
        selected: selectedIds.has(unit.id),
        transcriptionHref: buildTranscriptionDeepLinkHref({
          textId: resolvedTextId,
          ...(resolvedMediaId.length > 0 ? { mediaId: resolvedMediaId } : {}),
          unitId: unit.id,
        }),
      };
    });
    return {
      unitCount: units.length,
      basketCount: selectedIds.size,
      filterText,
      rows,
      exportPayload,
    };
  }, [
    basketRevision,
    filterState.scopeKey,
    filterState.text,
    mediaId,
    scopeKey,
    textId,
    unitsQuery.data,
  ]);

  const handleToggleUnit = useCallback((unitId: string) => {
    toggleCorpusBasketUnit(unitId);
    setBasketRevision((current) => current + 1);
  }, []);

  const handleFilterChange = useCallback(
    (text: string) => {
      const current = readCorpusViewState();
      writeCorpusViewState({
        ...(text.trim().length > 0 ? { filterText: text } : {}),
        ...(typeof current.listScrollTop === 'number'
          ? { listScrollTop: current.listScrollTop }
          : {}),
      });
      setFilterState({ scopeKey, text });
    },
    [scopeKey],
  );

  const handleListScroll = useCallback((scrollTop: number) => {
    const current = readCorpusViewState();
    writeCorpusViewState({
      ...(current.filterText ? { filterText: current.filterText } : {}),
      listScrollTop: scrollTop,
    });
  }, []);

  const handleCopyWorkset = useCallback(
    async (format: 'plain' | 'markdown') => {
      const payload: CorpusWorksetExportPayload = derived.exportPayload;
      if (payload.units.length === 0) {
        setCopyStatus('empty');
        return;
      }
      const text =
        format === 'markdown'
          ? formatCorpusWorksetMarkdown(payload)
          : formatCorpusWorksetPlain(payload);
      const ok = await writeCorpusWorksetClipboard(text);
      setCopyStatus(ok ? 'copied' : 'unavailable');
    },
    [derived.exportPayload],
  );

  const loadError =
    unitsQuery.error instanceof Error
      ? unitsQuery.error.message
      : unitsQuery.error
        ? t(locale, 'workspace.corpus.errorPrefix')
        : '';

  return {
    textId,
    mediaId,
    unitCount: derived.unitCount,
    basketCount: derived.basketCount,
    filterText: derived.filterText,
    rows: derived.rows,
    isEmpty: textId.length === 0,
    isLoading: textId.length > 0 && unitsQuery.isLoading,
    loadError,
    transcriptionHref: buildTranscriptionWorkspaceReturnHref(),
    copyStatus,
    listScrollTop: readCorpusViewState().listScrollTop ?? 0,
    onToggleUnit: handleToggleUnit,
    onFilterChange: handleFilterChange,
    onListScroll: handleListScroll,
    onCopyWorkset: handleCopyWorkset,
  };
}
