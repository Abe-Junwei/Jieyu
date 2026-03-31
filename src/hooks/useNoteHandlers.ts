import { useCallback, useMemo, useState } from 'react';
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
  activeUtteranceUnitId: string | null | undefined;
  focusedLayerRowId: string;
  utterances: Array<{ id: string }>;
  timelineUnitIds: string[];
  transcriptionLayers: Array<{ id: string }>;
  translationLayers: Array<{ id: string }>;
  updateTokenPos: (tokenId: string, pos: string | null) => Promise<void>;
  batchUpdateTokenPosByForm: (utteranceId: string, form: string, pos: string | null) => Promise<number>;
  selectUtterance: (id: string) => void;
  setSaveState: (s: SaveState) => void;
}

export function useNoteHandlers(input: UseNoteHandlersInput) {
  const {
    activeUtteranceUnitId,
    focusedLayerRowId,
    utterances,
    timelineUnitIds,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUtterance,
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
        : { targetType: 'utterance', targetId: notePopover.uttId };
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

  const uttNoteCountKeys = useMemo(() => utterances.map((u) => u.id), [utterances]);
  const uttNoteCounts = useNoteCounts('utterance', uttNoteCountKeys, noteVersion);

  const toggleNotes = useCallback(() => {
    if (notePopover) {
      setNotePopover(null);
    } else if (activeUtteranceUnitId) {
      setNotePopover({ x: window.innerWidth / 2 - 160, y: window.innerHeight / 3, uttId: activeUtteranceUnitId, layerId: focusedLayerRowId, scope: 'timeline' });
    }
  }, [activeUtteranceUnitId, focusedLayerRowId, notePopover]);

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

    const utteranceScopedCount = uttNoteCounts.get(unitId) ?? 0;
    if (utteranceScopedCount > 0) {
      return { count: utteranceScopedCount };
    }

    return null;
  }, [noteCounts, resolveTierAnnotationTargetId, uttNoteCounts]);

  const toCanonicalTokenId = useCallback((utteranceId: string, wordId: string): string => {
    if (wordId.includes('::')) return wordId;
    return `${utteranceId}::${wordId}`;
  }, []);

  const toCanonicalMorphemeId = useCallback((tokenId: string, morphemeId: string): string => {
    if (morphemeId.includes('::')) return morphemeId;
    return `${tokenId}::${morphemeId}`;
  }, []);

  const handleOpenWordNote = useCallback((
    utteranceId: string,
    wordId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const tokenId = toCanonicalTokenId(utteranceId, wordId);
    setNotePopover({
      x: event.clientX,
      y: event.clientY,
      uttId: utteranceId,
      noteTarget: {
        targetType: 'token',
        targetId: tokenId,
        parentTargetId: utteranceId,
      },
    });
  }, [toCanonicalTokenId]);

  const handleOpenMorphemeNote = useCallback((
    utteranceId: string,
    wordId: string,
    morphemeId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const tokenId = toCanonicalTokenId(utteranceId, wordId);
    const canonicalMorphemeId = toCanonicalMorphemeId(tokenId, morphemeId);
    setNotePopover({
      x: event.clientX,
      y: event.clientY,
      uttId: utteranceId,
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
      setSaveState({ kind: 'done', message: `POS 已${pos && pos.trim() ? '更新' : '清空'}` });
    } catch (error) {
      reportActionError({
        actionLabel: 'POS 保存',
        error,
        i18nKey: 'transcription.error.action.posSaveFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: error instanceof Error ? error.message : 'POS 保存失败',
      });
    }
  }, [setSaveState, updateTokenPos]);

  const handleBatchUpdateTokenPosByForm = useCallback(async (
    utteranceId: string,
    form: string,
    pos: string | null,
  ) => {
    try {
      const updated = await batchUpdateTokenPosByForm(utteranceId, form, pos);
      if (updated <= 0) {
        reportValidationError({
          message: `未找到词形「${form}」`,
          i18nKey: 'transcription.error.validation.posFormNotFound',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
      } else {
        setSaveState({ kind: 'done', message: `已更新 ${updated} 个 token 的 POS` });
      }
      return updated;
    } catch (error) {
      reportActionError({
        actionLabel: '批量 POS 保存',
        error,
        i18nKey: 'transcription.error.action.posBatchSaveFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: error instanceof Error ? error.message : '批量 POS 保存失败',
      });
      return 0;
    }
  }, [batchUpdateTokenPosByForm, setSaveState]);

  const handleExecuteRecommendation = useCallback(async (item: ActionableRecommendation) => {
    if (item.actionType === 'batch_pos') {
      if (!item.targetUtteranceId || !item.targetForm || !item.targetPos) {
        reportValidationError({
          message: '当前没有可执行的批量 POS 候选',
          i18nKey: 'transcription.error.validation.posBatchCandidateMissing',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }

      const updated = await handleBatchUpdateTokenPosByForm(item.targetUtteranceId, item.targetForm, item.targetPos);
      if (updated > 0) {
        selectUtterance(item.targetUtteranceId);
        setSaveState({ kind: 'done', message: `已批量赋值 ${updated} 个 token（${item.targetForm} → ${item.targetPos}）` });
      }
      return;
    }

    if (!item.targetUtteranceId) {
      reportValidationError({
        message: '当前没有可执行的目标语段',
        i18nKey: 'transcription.error.validation.recommendationTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    selectUtterance(item.targetUtteranceId);
    if (item.actionType === 'risk_review') {
      const confidenceText = typeof item.targetConfidence === 'number'
        ? `（置信度 ${(item.targetConfidence * 100).toFixed(1)}%）`
        : '';
      setSaveState({ kind: 'done', message: `已跳转到风险复核语段${confidenceText}` });
      return;
    }

    setSaveState({ kind: 'done', message: '已跳转到建议处理语段' });
  }, [handleBatchUpdateTokenPosByForm, selectUtterance, setSaveState]);

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
