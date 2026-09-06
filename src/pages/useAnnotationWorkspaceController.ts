import { useCallback, useMemo, useRef, useState } from 'react';
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
  stepAnnotationUnitId,
  type AnnotationKeyboardAction,
  type AnnotationKeyboardMode,
} from './annotation/annotationKeyboardMachine';
import { projectAnnotationLaneUnits } from './annotation/annotationLaneUnitProjection';
import {
  collectDirtyAnnotationTokenWrites,
  displayedAnnotationTokenFields,
  dropDraftsForTokenIds,
  resolveAnnotationGlossWriteLang,
  type AnnotationIgtToken,
  type AnnotationTokenDraft,
} from './annotation/annotationTokenDrafts';
import { saveAnnotationIgtRowTokens } from './annotation/saveAnnotationIgtRowTokens';

export type { AnnotationIgtToken };

export type AnnotationSaveNotice = {
  kind: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
};

export type AnnotationIgtRow = {
  id: string;
  timeLabel: string;
  surface: string;
  tokens: AnnotationIgtToken[];
  translation: string;
  transcriptionHref: string;
};

function isEditableFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function useAnnotationWorkspaceController() {
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const [keyboard, setKeyboard] = useState<{
    mode: AnnotationKeyboardMode;
    focusedUnitId: string;
    lastAction: AnnotationKeyboardAction;
  }>({ mode: 'rowFocused', focusedUnitId: '', lastAction: 'none' });
  const [drafts, setDrafts] = useState<Record<string, AnnotationTokenDraft>>({});
  const [saveNotice, setSaveNotice] = useState<AnnotationSaveNotice>({
    kind: 'idle',
    message: '',
  });
  const savingRef = useRef(false);

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
          gloss: pickDefaultTranscriptionText(token.gloss),
          pos: (token.pos ?? '').trim(),
          glossLang: resolveAnnotationGlossWriteLang(token.gloss),
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

  const handleFocusInput = useCallback((unitId: string) => {
    const next = reduceAnnotationKeyboard(
      { mode: 'inputFocused', focusedUnitId: unitId },
      { type: 'focusInput', unitId },
      [unitId],
    );
    setKeyboard({ ...next.state, lastAction: next.action });
  }, []);

  const handleTokenDraftChange = useCallback(
    (unitId: string, tokenId: string, field: keyof AnnotationTokenDraft, value: string) => {
      const row = derived.rows.find((item) => item.id === unitId);
      const token = row?.tokens.find((item) => item.id === tokenId);
      if (!token) return;
      setDrafts((prev) => {
        const current = displayedAnnotationTokenFields(token, prev);
        const merged: AnnotationTokenDraft = { ...current, [field]: value };
        if (merged.pos === token.pos && merged.gloss === token.gloss) {
          return dropDraftsForTokenIds(prev, [tokenId]);
        }
        return { ...prev, [tokenId]: merged };
      });
    },
    [derived.rows],
  );

  const runCommit = useCallback(
    async (advance: boolean) => {
      if (savingRef.current) return;
      const unitId = derived.focusedUnitId;
      const row = derived.rows.find((item) => item.id === unitId);
      if (!row) return;
      const writes = collectDirtyAnnotationTokenWrites(row.tokens, drafts);
      savingRef.current = true;
      setSaveNotice({ kind: 'saving', message: '' });
      try {
        if (writes.length > 0) {
          await saveAnnotationIgtRowTokens(unitId, writes);
          await dataQuery.refetch();
        }
        setDrafts((prev) =>
          dropDraftsForTokenIds(
            prev,
            row.tokens.map((token) => token.id),
          ),
        );
        setSaveNotice({ kind: 'saved', message: '' });
        if (advance) {
          const nextId = stepAnnotationUnitId(derived.unitIds, unitId, 1);
          setKeyboard({
            mode: 'inputFocused',
            focusedUnitId: nextId,
            lastAction: 'commitNext',
          });
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t(locale, 'workspace.annotation.saveError');
        setSaveNotice({ kind: 'error', message });
      } finally {
        savingRef.current = false;
      }
    },
    [dataQuery, derived.focusedUnitId, derived.rows, derived.unitIds, drafts, locale],
  );

  const handleKeyDown = useCallback(
    (event: {
      key: string;
      ctrlKey: boolean;
      shiftKey: boolean;
      preventDefault: () => void;
      target: EventTarget | null;
    }) => {
      if (
        isEditableFieldTarget(event.target) &&
        (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space')
      ) {
        return;
      }
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
      if (result.action === 'commitStay' || result.action === 'commitNext') {
        void runCommit(result.action === 'commitNext');
      }
    },
    [derived.focusedUnitId, derived.unitIds, keyboard.mode, runCommit],
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
    drafts,
    focusedUnitId: derived.focusedUnitId,
    keyboardMode: keyboard.mode,
    lastAction: keyboard.lastAction,
    saveNotice,
    isEmpty: textId.length === 0,
    isLoading: textId.length > 0 && dataQuery.isLoading,
    loadError,
    transcriptionHref: buildTranscriptionWorkspaceReturnHref(),
    reload: dataQuery.refetch,
    onFocusRow: handleFocusRow,
    onFocusInput: handleFocusInput,
    onTokenDraftChange: handleTokenDraftChange,
    onKeyDown: handleKeyDown,
  };
}
