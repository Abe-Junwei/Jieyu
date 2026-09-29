import { annotationWorkspaceWriteActions } from './annotationWorkspaceController.actions';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { loadAnnotationWorkspace } from './annotationWorkspaceController.data';
import { useWorkspaceEventRefresh } from '../hooks/useWorkspaceEventRefresh';
import { t, useLocale } from '../i18n';
import {
  readAnalysisDeepLinkParams,
  resolveAnalysisWorkspaceScope,
} from '../utils/analysisUrlDeepLink';
import {
  buildTranscriptionWorkspaceReturnHref,
  readTranscriptionWorkspaceReturnHint,
} from '../utils/transcriptionUrlDeepLink';
import {
  isAnnotationNativeSpaceActivationTarget,
  isAnnotationSpaceShortcutKey,
  isAnnotationTypingTarget,
} from './annotation/annotationKeyboardTarget';
import {
  reduceAnnotationKeyboard,
  stepAnnotationUnitId,
  type AnnotationKeyboardAction,
  type AnnotationKeyboardMode,
} from './annotation/annotationKeyboardMachine';
import {
  collectDirtyAnnotationTokenWrites,
  displayedAnnotationTokenFields,
  dropCommittedTokenDrafts,
  dropDraftsForTokenIds,
  type AnnotationIgtToken,
  type AnnotationTokenDraft,
} from './annotation/annotationTokenDrafts';
import { buildAnnotationIgtRows, type AnnotationIgtRow } from './annotation/annotationIgtRows';
import {
  pickAnnotationLayerText,
  pickAnnotationTranslationText,
} from './annotation/annotationTranslationText';
import { saveAnnotationIgtRowTokens } from './annotation/saveAnnotationIgtRowTokens';

export type { AnnotationIgtToken, AnnotationIgtRow };

export type AnnotationSaveNotice = {
  kind: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
};

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
  const [translationLayerId, setTranslationLayerId] = useState('');
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
    queryFn: () => loadAnnotationWorkspace(textId, mediaId),
    enabled: textId.length > 0,
  });

  const derived = useMemo(() => {
    const contents = dataQuery.data?.contents ?? [];
    const translationLayers = dataQuery.data?.translationLayers ?? [];
    const activeTranslationLayerId = translationLayers.some(
      (layer) => layer.id === translationLayerId,
    )
      ? translationLayerId
      : (translationLayers[0]?.id ?? '');
    const translations = pickAnnotationTranslationText({
      contents,
      translationLayerIds: activeTranslationLayerId.length > 0 ? [activeTranslationLayerId] : [],
    });
    const surfaces = pickAnnotationLayerText({
      contents,
      layerIds: dataQuery.data?.transcriptionLayerIds ?? [],
    });
    const rows = buildAnnotationIgtRows({
      units: dataQuery.data?.units ?? [],
      tokens: dataQuery.data?.tokens ?? [],
      textId,
      mediaId,
      translations,
      surfaces,
      languageId: dataQuery.data?.languageId ?? '',
      ...(dataQuery.data?.speakerNames ? { speakerNames: dataQuery.data.speakerNames } : {}),
    });
    const unitIds = rows.map((row) => row.id);
    const urlUnitId = parsed.unitId;
    const focusedUnitId =
      keyboard.focusedUnitId.length > 0 && unitIds.includes(keyboard.focusedUnitId)
        ? keyboard.focusedUnitId
        : urlUnitId.length > 0 && unitIds.includes(urlUnitId)
          ? urlUnitId
          : (unitIds[0] ?? '');
    return {
      rows,
      unitIds,
      focusedUnitId,
      unitCount: rows.length,
      languageId: dataQuery.data?.languageId ?? '',
      translationLayers,
      activeTranslationLayerId,
    };
  }, [dataQuery.data, keyboard.focusedUnitId, mediaId, parsed.unitId, textId, translationLayerId]);

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
      const committedDrafts: Record<string, AnnotationTokenDraft> = {};
      for (const write of writes) {
        const draft = drafts[write.tokenId];
        if (draft) committedDrafts[write.tokenId] = draft;
      }
      savingRef.current = true;
      setSaveNotice({ kind: 'saving', message: '' });
      try {
        if (writes.length > 0) {
          await saveAnnotationIgtRowTokens(unitId, writes);
          await dataQuery.refetch();
        }
        setDrafts((prev) => dropCommittedTokenDrafts(prev, committedDrafts));
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

  useWorkspaceEventRefresh({
    hasDraftForUnit: (unitId) =>
      derived.rows
        .find((item) => item.id === unitId)
        ?.tokens.some((token) => drafts[token.id] !== undefined) === true,
    onUnitUpdated: (detail) => {
      if (derived.unitIds.includes(detail.unitId)) void dataQuery.refetch();
    },
  });

  const handleKeyDown = useCallback(
    (event: {
      key: string;
      ctrlKey: boolean;
      shiftKey: boolean;
      preventDefault: () => void;
      target: EventTarget | null;
    }): AnnotationKeyboardAction => {
      if (isAnnotationSpaceShortcutKey(event.key)) {
        if (isAnnotationTypingTarget(event.target)) return 'insertSpace';
        if (isAnnotationNativeSpaceActivationTarget(event.target)) return 'none';
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
        return 'none';
      }
      event.preventDefault();
      setKeyboard({ ...result.state, lastAction: result.action });
      if (result.action === 'commitStay' || result.action === 'commitNext') {
        void runCommit(result.action === 'commitNext');
      }
      return result.action;
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
    ...annotationWorkspaceWriteActions({
      textId,
      languageId: derived.languageId,
      rows: derived.rows,
      reload: () => dataQuery.refetch({ throwOnError: true }),
      setSaveNotice,
      locale,
    }),
    textId,
    unitCount: derived.unitCount,
    rows: derived.rows,
    languageId: derived.languageId,
    translationLayers: derived.translationLayers,
    activeTranslationLayerId: derived.activeTranslationLayerId,
    onSelectTranslationLayer: setTranslationLayerId,
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
    clearTokenDrafts: (tokenIds: readonly string[]) => {
      setDrafts((current) => dropDraftsForTokenIds(current, tokenIds));
    },
    onKeyDown: handleKeyDown,
  };
}
