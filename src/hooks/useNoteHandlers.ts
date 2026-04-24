import { useCallback, useMemo, useState } from 'react';
import { useOptionalLocale } from '../i18n';
import { getNoteHandlersMessages } from '../i18n/messages';
import { useNotes, useNoteCounts, type NoteTarget } from './useNotes';
import type { ActionableRecommendation } from './useAiPanelLogic';
import type { SaveState } from './useTranscriptionData';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';

export interface NotePopoverState {
  x: number;
  y: number;
  uttId: string;
  layerId?: string;
  scope?: 'timeline' | 'waveform';
  noteTarget?: NoteTarget;
}

export interface UseNoteHandlersInput {
  activeUnitId: string | null | undefined;
  focusedLayerRowId: string;
  units: Array<{ id: string }>;
  timelineUnitIds: string[];
  transcriptionLayers: Array<{ id: string }>;
  translationLayers: Array<{ id: string }>;
  updateTokenPos: (tokenId: string, pos: string | null) => Promise<void>;
  batchUpdateTokenPosByForm: (unitId: string, form: string, pos: string | null) => Promise<number>;
  selectUnit: (id: string) => void;
  setSaveState: (s: SaveState) => void;
}

export function useNoteHandlers(input: UseNoteHandlersInput) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const messages = getNoteHandlersMessages(locale);
  const {
    activeUnitId,
    focusedLayerRowId,
    units,
    timelineUnitIds,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUnit,
    setSaveState,
  } = input;

  const [notePopover, setNotePopover] = useState<NotePopoverState | null>(null);

  const resolveTierAnnotationTargetId = useCallback((uttId: string, layerId: string, scope: 'timeline' | 'waveform') => {
    if (scope === 'waveform') return `${uttId}::${layerId}::@waveform`;
    return `${uttId}::${layerId}`;
  }, []);

  const noteTarget = useMemo<NoteTarget | null>(
    () => {
      if (!notePopover) return null;
      if (notePopover.noteTarget) return notePopover.noteTarget;
      const scope = notePopover.scope ?? 'timeline';
      return notePopover.layerId
        ? { targetType: 'tier_annotation', targetId: resolveTierAnnotationTargetId(notePopover.uttId, notePopover.layerId, scope) }
        : { targetType: 'unit', targetId: notePopover.uttId };
    },
    [notePopover, resolveTierAnnotationTargetId],
  );

  const { notes: currentNotes, addNote, updateNote, deleteNote, version: noteVersion } = useNotes(noteTarget);

  const allLayerIds = useMemo(
    () => [...transcriptionLayers, ...translationLayers].map((layer) => layer.id),
    [transcriptionLayers, translationLayers],
  );

  const noteCountKeys = useMemo(() => {
    const keys: string[] = [];
    for (const unitId of timelineUnitIds) {
      for (const layerId of allLayerIds) {
        keys.push(resolveTierAnnotationTargetId(unitId, layerId, 'timeline'));
        keys.push(resolveTierAnnotationTargetId(unitId, layerId, 'waveform'));
      }
    }
    return keys;
  }, [allLayerIds, resolveTierAnnotationTargetId, timelineUnitIds]);

  const noteCounts = useNoteCounts('tier_annotation', noteCountKeys, noteVersion);

  const uttNoteCountKeys = useMemo(() => units.map((u) => u.id), [units]);
  const uttNoteCounts = useNoteCounts('unit', uttNoteCountKeys, noteVersion);

  const toggleNotes = useCallback(() => {
    if (notePopover) {
      setNotePopover(null);
    } else if (activeUnitId) {
      setNotePopover({ x: window.innerWidth / 2 - 160, y: window.innerHeight / 3, uttId: activeUnitId, layerId: focusedLayerRowId, scope: 'timeline' });
    }
  }, [activeUnitId, focusedLayerRowId, notePopover]);

  const handleNoteClick = useCallback(
    (uttId: string, layerId: string | undefined, e: React.MouseEvent) => {
      setNotePopover({ x: e.clientX, y: e.clientY, uttId, ...(layerId ? { layerId } : {}), scope: 'timeline' });
    },
    [],
  );

  const resolveNoteIndicatorTarget = useCallback((unitId: string, layerId?: string, scope: 'timeline' | 'waveform' = 'timeline') => {
    if (layerId) {
      const layerScopedCount = noteCounts.get(resolveTierAnnotationTargetId(unitId, layerId, scope)) ?? 0;
      if (layerScopedCount > 0) {
        return { count: layerScopedCount, layerId };
      }
    }

    if (scope === 'waveform') {
      return null;
    }

    const unitScopedCount = uttNoteCounts.get(unitId) ?? 0;
    if (unitScopedCount > 0) {
      return { count: unitScopedCount };
    }

    return null;
  }, [noteCounts, resolveTierAnnotationTargetId, uttNoteCounts]);

  const toCanonicalTokenId = useCallback((unitId: string, wordId: string): string => {
    if (wordId.includes('::')) return wordId;
    return `${unitId}::${wordId}`;
  }, []);

  const toCanonicalMorphemeId = useCallback((tokenId: string, morphemeId: string): string => {
    if (morphemeId.includes('::')) return morphemeId;
    return `${tokenId}::${morphemeId}`;
  }, []);

  const handleOpenWordNote = useCallback((
    unitId: string,
    wordId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const tokenId = toCanonicalTokenId(unitId, wordId);
    setNotePopover({
      x: event.clientX,
      y: event.clientY,
      uttId: unitId,
      noteTarget: {
        targetType: 'token',
        targetId: tokenId,
        parentTargetId: unitId,
      },
    });
  }, [toCanonicalTokenId]);

  const handleOpenMorphemeNote = useCallback((
    unitId: string,
    wordId: string,
    morphemeId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const tokenId = toCanonicalTokenId(unitId, wordId);
    const canonicalMorphemeId = toCanonicalMorphemeId(tokenId, morphemeId);
    setNotePopover({
      x: event.clientX,
      y: event.clientY,
      uttId: unitId,
      noteTarget: {
        targetType: 'morpheme',
        targetId: canonicalMorphemeId,
        parentTargetId: tokenId,
      },
    });
  }, [toCanonicalMorphemeId, toCanonicalTokenId]);

  const handleUpdateTokenPos = useCallback(async (tokenId: string, pos: string | null) => {
    try {
      await updateTokenPos(tokenId, pos);
      setSaveState({ kind: 'done', message: pos && pos.trim() ? messages.posUpdated : messages.posCleared });
    } catch (error) {
      reportActionError({
        actionLabel: messages.actionPosSave,
        error,
        i18nKey: 'transcription.error.action.posSaveFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: error instanceof Error ? error.message : messages.posSaveFailed,
      });
    }
  }, [messages, setSaveState, updateTokenPos]);

  const handleBatchUpdateTokenPosByForm = useCallback(async (
    unitId: string,
    form: string,
    pos: string | null,
  ) => {
    try {
      const updated = await batchUpdateTokenPosByForm(unitId, form, pos);
      if (updated <= 0) {
        reportValidationError({
          message: messages.posFormNotFound(form),
          i18nKey: 'transcription.error.validation.posFormNotFound',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
      } else {
        setSaveState({ kind: 'done', message: messages.posBatchSaved(updated) });
      }
      return updated;
    } catch (error) {
      reportActionError({
        actionLabel: messages.actionPosBatchSave,
        error,
        i18nKey: 'transcription.error.action.posBatchSaveFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: error instanceof Error ? error.message : messages.posBatchSaveFailed,
      });
      return 0;
    }
  }, [batchUpdateTokenPosByForm, messages, setSaveState]);

  const handleExecuteRecommendation = useCallback(async (item: ActionableRecommendation) => {
    if (item.actionType === 'batch_pos') {
      if (!item.targetUnitId || !item.targetForm || !item.targetPos) {
        reportValidationError({
          message: messages.posBatchCandidateMissing,
          i18nKey: 'transcription.error.validation.posBatchCandidateMissing',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }

      const updated = await handleBatchUpdateTokenPosByForm(item.targetUnitId, item.targetForm, item.targetPos);
      if (updated > 0) {
        selectUnit(item.targetUnitId);
        setSaveState({ kind: 'done', message: messages.recommendationBatchApplied(updated, item.targetForm, item.targetPos) });
      }
      return;
    }

    if (!item.targetUnitId) {
      reportValidationError({
        message: messages.recommendationTargetMissing,
        i18nKey: 'transcription.error.validation.recommendationTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    selectUnit(item.targetUnitId);
    if (item.actionType === 'risk_review') {
      const confidenceText = typeof item.targetConfidence === 'number'
        ? messages.confidenceSuffix(item.targetConfidence)
        : '';
      setSaveState({ kind: 'done', message: messages.riskReviewJumped(confidenceText) });
      return;
    }

    setSaveState({ kind: 'done', message: messages.recommendationJumped });
  }, [handleBatchUpdateTokenPosByForm, messages, selectUnit, setSaveState]);

  return {
    notePopover,
    setNotePopover,
    noteTarget,
    currentNotes,
    addNote,
    updateNote,
    deleteNote,
    noteCounts,
    uttNoteCounts,
    toggleNotes,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    handleExecuteRecommendation,
  };
}
