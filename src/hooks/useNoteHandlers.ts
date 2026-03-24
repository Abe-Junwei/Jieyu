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
  noteTarget?: NoteTarget;
}

export interface UseNoteHandlersInput {
  selectedUtteranceId: string | null | undefined;
  focusedLayerRowId: string;
  utterances: Array<{ id: string }>;
  transcriptionLayers: Array<{ id: string }>;
  translationLayers: Array<{ id: string }>;
  updateTokenPos: (tokenId: string, pos: string | null) => Promise<void>;
  batchUpdateTokenPosByForm: (utteranceId: string, form: string, pos: string | null) => Promise<number>;
  selectUtterance: (id: string) => void;
  setSaveState: (s: SaveState) => void;
}

export function useNoteHandlers(input: UseNoteHandlersInput) {
  const {
    selectedUtteranceId,
    focusedLayerRowId,
    utterances,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUtterance,
    setSaveState,
  } = input;

  const [notePopover, setNotePopover] = useState<NotePopoverState | null>(null);

  const noteTarget = useMemo<NoteTarget | null>(
    () => {
      if (!notePopover) return null;
      if (notePopover.noteTarget) return notePopover.noteTarget;
      return notePopover.layerId
        ? { targetType: 'tier_annotation', targetId: `${notePopover.uttId}::${notePopover.layerId}` }
        : { targetType: 'utterance', targetId: notePopover.uttId };
    },
    [notePopover],
  );

  const { notes: currentNotes, addNote, updateNote, deleteNote, version: noteVersion } = useNotes(noteTarget);

  const noteCountKeys = useMemo(() => {
    const keys: string[] = [];
    const allLayers = [...transcriptionLayers, ...translationLayers];
    for (const u of utterances) {
      for (const l of allLayers) {
        keys.push(`${u.id}::${l.id}`);
      }
    }
    return keys;
  }, [utterances, transcriptionLayers, translationLayers]);

  const noteCounts = useNoteCounts('tier_annotation', noteCountKeys, noteVersion);

  const uttNoteCountKeys = useMemo(() => utterances.map((u) => u.id), [utterances]);
  const uttNoteCounts = useNoteCounts('utterance', uttNoteCountKeys, noteVersion);

  const toggleNotes = useCallback(() => {
    if (notePopover) {
      setNotePopover(null);
    } else if (selectedUtteranceId) {
      setNotePopover({ x: window.innerWidth / 2 - 160, y: window.innerHeight / 3, uttId: selectedUtteranceId, layerId: focusedLayerRowId });
    }
  }, [selectedUtteranceId, focusedLayerRowId, notePopover]);

  const handleNoteClick = useCallback(
    (uttId: string, layerId: string, e: React.MouseEvent) => {
      setNotePopover({ x: e.clientX, y: e.clientY, uttId, layerId });
    },
    [],
  );

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
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    handleExecuteRecommendation,
  };
}
