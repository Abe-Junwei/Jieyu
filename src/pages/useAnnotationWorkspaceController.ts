import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { t, useLocale } from '../i18n';
import type { UnitTokenDocType } from '../types/jieyuDbDocTypes';
import {
  readAnalysisDeepLinkParams,
  resolveAnalysisWorkspaceScope,
} from '../utils/analysisUrlDeepLink';
import { formatTime, pickDefaultTranscriptionText } from '../utils/transcriptionFormatters';
import {
  buildTranscriptionDeepLinkHref,
  buildTranscriptionWorkspaceReturnHref,
  readTranscriptionWorkspaceReturnHint,
} from '../utils/transcriptionUrlDeepLink';
import {
  reduceAnnotationKeyboard,
  type AnnotationKeyboardAction,
  type AnnotationKeyboardMode,
} from './annotation/annotationKeyboardMachine';
import { projectAnnotationLaneUnits } from './annotation/annotationLaneUnitProjection';

export type AnnotationIgtToken = {
  id: string;
  form: string;
  gloss: string;
};

export type AnnotationIgtRow = {
  id: string;
  timeLabel: string;
  surface: string;
  tokens: AnnotationIgtToken[];
  translation: string;
  transcriptionHref: string;
};

function glossForToken(token: UnitTokenDocType): string {
  return pickDefaultTranscriptionText(token.gloss ?? {});
}

export function useAnnotationWorkspaceController() {
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const [keyboard, setKeyboard] = useState<{
    mode: AnnotationKeyboardMode;
    focusedUnitId: string;
    lastAction: AnnotationKeyboardAction;
  }>({ mode: 'rowFocused', focusedUnitId: '', lastAction: 'none' });

  const parsed = readAnalysisDeepLinkParams(searchParams);
  const hint = readTranscriptionWorkspaceReturnHint();
  const { textId, mediaId } = resolveAnalysisWorkspaceScope({
    urlTextId: parsed.textId,
    urlMediaId: parsed.mediaId,
    hint,
  });

  const dataQuery = useQuery({
    queryKey: ['annotation-workspace', textId, mediaId],
    queryFn: async () => {
      const [units, layers] = await Promise.all([
        LinguisticService.units.listByTextId(textId),
        LinguisticService.layers.listByTextId(textId),
      ]);
      const laneUnits = projectAnnotationLaneUnits({ units, layers, mediaId });
      const tokens = await LinguisticService.units.listTokensByUnitIds(
        laneUnits.map((unit) => unit.id),
      );
      return { units: laneUnits, tokens };
    },
    enabled: textId.length > 0,
  });

  const derived = useMemo(() => {
    const units = dataQuery.data?.units ?? [];
    const tokensByUnit = new Map<string, UnitTokenDocType[]>();
    for (const token of dataQuery.data?.tokens ?? []) {
      const list = tokensByUnit.get(token.unitId) ?? [];
      list.push(token);
      tokensByUnit.set(token.unitId, list);
    }
    const rows: AnnotationIgtRow[] = units.map((unit) => {
      const unitTokens = [...(tokensByUnit.get(unit.id) ?? [])].sort(
        (a, b) => a.tokenIndex - b.tokenIndex,
      );
      const resolvedMediaId =
        unit.mediaId !== undefined && unit.mediaId.length > 0 ? unit.mediaId : mediaId;
      return {
        id: unit.id,
        timeLabel: formatTime(unit.startTime),
        surface: pickDefaultTranscriptionText(unit.transcription ?? {}),
        tokens: unitTokens.map((token) => ({
          id: token.id,
          form: pickDefaultTranscriptionText(token.form),
          gloss: glossForToken(token),
        })),
        translation: '',
        transcriptionHref: buildTranscriptionDeepLinkHref({
          textId: unit.textId.length > 0 ? unit.textId : textId,
          ...(resolvedMediaId.length > 0 ? { mediaId: resolvedMediaId } : {}),
          unitId: unit.id,
        }),
      };
    });
    const unitIds = rows.map((row) => row.id);
    const focusedUnitId =
      keyboard.focusedUnitId.length > 0 && unitIds.includes(keyboard.focusedUnitId)
        ? keyboard.focusedUnitId
        : (unitIds[0] ?? '');
    return { rows, unitIds, focusedUnitId, unitCount: rows.length };
  }, [dataQuery.data, keyboard.focusedUnitId, mediaId, textId]);

  const handleFocusRow = useCallback((unitId: string) => {
    const next = reduceAnnotationKeyboard(
      { mode: 'rowFocused', focusedUnitId: unitId },
      { type: 'focusRow', unitId },
      [unitId],
    );
    setKeyboard({ ...next.state, lastAction: next.action });
  }, []);

  const handleKeyDown = useCallback(
    (event: { key: string; ctrlKey: boolean; shiftKey: boolean; preventDefault: () => void }) => {
      const result = reduceAnnotationKeyboard(
        { mode: keyboard.mode, focusedUnitId: derived.focusedUnitId },
        {
          type: 'keydown',
          key: event.key,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          hasSuggestion: false,
        },
        derived.unitIds,
      );
      if (
        result.action === 'none' &&
        result.state.mode === keyboard.mode &&
        result.state.focusedUnitId === derived.focusedUnitId
      ) {
        return;
      }
      event.preventDefault();
      setKeyboard({ ...result.state, lastAction: result.action });
    },
    [derived.focusedUnitId, derived.unitIds, keyboard.mode],
  );

  const loadError =
    dataQuery.error instanceof Error
      ? dataQuery.error.message
      : dataQuery.error
        ? t(locale, 'workspace.annotation.errorPrefix')
        : '';

  return {
    textId,
    unitCount: derived.unitCount,
    rows: derived.rows,
    focusedUnitId: derived.focusedUnitId,
    keyboardMode: keyboard.mode,
    lastAction: keyboard.lastAction,
    isEmpty: textId.length === 0,
    isLoading: textId.length > 0 && dataQuery.isLoading,
    loadError,
    transcriptionHref: buildTranscriptionWorkspaceReturnHref(),
    onFocusRow: handleFocusRow,
    onKeyDown: handleKeyDown,
  };
}
