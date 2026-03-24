import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AiPanelCardKey, AiPanelMode, AiPanelTask } from '../components/AiAnalysisPanel';
import { LinguisticService } from '../services/LinguisticService';
import { ProjectObserver, type Recommendation } from '../ai/ProjectObserver';
import type { AiSystemPersonaKey } from './useAiChat';

const TASK_TO_PERSONA: Record<AiPanelTask, AiSystemPersonaKey> = {
  segmentation: 'transcription',
  transcription: 'transcription',
  translation: 'transcription',
  pos_tagging: 'glossing',
  glossing: 'glossing',
  risk_review: 'review',
  ai_chat_setup: 'transcription',
};

export function taskToPersona(task: AiPanelTask): AiSystemPersonaKey {
  return TASK_TO_PERSONA[task];
}
import type { UtteranceDocType } from '../db';
import type { SaveState } from './useTranscriptionData';
import { reportValidationError } from '../utils/validationErrorReporter';

type ActionableRecommendation = Recommendation & {
  actionType?: 'jump' | 'batch_pos' | 'risk_review';
  targetUtteranceId?: string;
  targetForm?: string;
  targetPos?: string;
  targetConfidence?: number;
};

export type { ActionableRecommendation };

export interface UseAiPanelLogicInput {
  utterances: UtteranceDocType[];
  selectedUtterance: UtteranceDocType | undefined;
  selectedUtteranceText: string;
  translationLayers: Array<{ id: string; key: string }>;
  translationDrafts: Record<string, string>;
  translationTextByLayer: Map<string, Map<string, { text?: string }>>;
  aiChatConnectionTestStatus: string;
  aiPanelMode: AiPanelMode;
  selectUtterance: (id: string) => void;
  setSaveState: (s: SaveState) => void;
}

export function useAiPanelLogic({
  utterances,
  selectedUtterance,
  selectedUtteranceText,
  translationLayers,
  translationDrafts,
  translationTextByLayer,
  aiChatConnectionTestStatus,
  aiPanelMode,
  selectUtterance,
  setSaveState,
}: UseAiPanelLogicInput) {
  // ── Lexeme search ──
  const [lexemeMatches, setLexemeMatches] = useState<Array<{ id: string; lemma: Record<string, string> }>>([]);

  useEffect(() => {
    const query = selectedUtteranceText.trim();
    if (!query) {
      setLexemeMatches([]);
      return;
    }

    const token = query.split(/\s+/).filter(Boolean)[0] ?? '';
    if (!token) {
      setLexemeMatches([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void LinguisticService.searchLexemes(token)
        .then((items) => setLexemeMatches(items.slice(0, 8)))
        .catch(() => setLexemeMatches([]));
    }, 120);

    return () => window.clearTimeout(timer);
  }, [selectedUtterance?.id, selectedUtteranceText]);

  // ── Project observer ──
  const observer = useMemo(() => new ProjectObserver(), []);
  const observerResult = useMemo(() => {
    const total = utterances.length;
    const transcribed = utterances.filter((u) => {
      if (u.annotationStatus === 'transcribed' || u.annotationStatus === 'translated' || u.annotationStatus === 'glossed' || u.annotationStatus === 'verified') {
        return true;
      }
      return typeof u.transcription?.default === 'string' && u.transcription.default.trim().length > 0;
    }).length;
    const glossed = utterances.filter((u) => u.annotationStatus === 'glossed' || u.annotationStatus === 'verified').length;
    const verified = utterances.filter((u) => u.annotationStatus === 'verified').length;

    return observer.evaluate({
      utteranceCount: total,
      transcribedRate: total === 0 ? 0 : transcribed / total,
      glossedRate: total === 0 ? 0 : glossed / total,
      verifiedRate: total === 0 ? 0 : verified / total,
    });
  }, [observer, utterances]);

  // ── Actionable recommendations ──
  const actionableObserverRecommendations = useMemo(() => {
    const nextUntranscribed = utterances.find((u) => {
      if (u.annotationStatus === 'transcribed' || u.annotationStatus === 'translated' || u.annotationStatus === 'glossed' || u.annotationStatus === 'verified') {
        return false;
      }
      return !(typeof u.transcription?.default === 'string' && u.transcription.default.trim().length > 0);
    });
    const nextUntaggedPosUtterance = utterances.find((u) => (
      Array.isArray(u.words) && u.words.some((word) => (word.pos ?? '').trim().length === 0)
    ));
    const nextUnglossed = utterances.find((u) => u.annotationStatus !== 'glossed' && u.annotationStatus !== 'verified');
    const nextUnverified = utterances.find((u) => u.annotationStatus !== 'verified');

    const riskCandidate = utterances
      .filter((u) => typeof u.ai_metadata?.confidence === 'number')
      .sort((a, b) => (a.ai_metadata?.confidence ?? 1) - (b.ai_metadata?.confidence ?? 1))[0];

    const batchPosCandidate = (() => {
      for (const utterance of utterances) {
        if (!Array.isArray(utterance.words) || utterance.words.length === 0) continue;

        const formStats = new Map<string, { form: string; taggedPos?: string; untaggedCount: number }>();
        for (const word of utterance.words) {
          const form = (word.form.default ?? Object.values(word.form)[0] ?? '').trim();
          if (form.length === 0) continue;

          const key = form.toLowerCase();
          const prev = formStats.get(key) ?? { form, untaggedCount: 0 };
          const pos = (word.pos ?? '').trim();
          if (pos.length > 0) {
            if (!prev.taggedPos) {
              prev.taggedPos = pos;
            }
          } else {
            prev.untaggedCount += 1;
          }
          formStats.set(key, prev);
        }

        const winner = [...formStats.values()]
          .filter((item) => !!item.taggedPos && item.untaggedCount > 0)
          .sort((a, b) => b.untaggedCount - a.untaggedCount)[0];

        if (winner && winner.taggedPos) {
          return {
            utteranceId: utterance.id,
            form: winner.form,
            pos: winner.taggedPos,
          };
        }
      }

      return null;
    })();

    return observerResult.recommendations.map((item): ActionableRecommendation => {
      if (item.id === 'transcribing-batch-pos') {
        return {
          ...item,
          ...(batchPosCandidate
            ? {
              actionType: 'batch_pos',
              targetUtteranceId: batchPosCandidate.utteranceId,
              targetForm: batchPosCandidate.form,
              targetPos: batchPosCandidate.pos,
            }
            : {}),
        };
      }

      if (item.id === 'transcribing-jump-untagged') {
        return {
          ...item,
          actionType: 'jump',
          ...(nextUntaggedPosUtterance ? { targetUtteranceId: nextUntaggedPosUtterance.id } : {}),
        };
      }

      if (item.id === 'glossing-risk-review' || item.id === 'reviewing-risk-review') {
        return {
          ...item,
          actionType: 'risk_review',
          ...(riskCandidate ? { targetUtteranceId: riskCandidate.id } : {}),
          ...((riskCandidate && typeof riskCandidate.ai_metadata?.confidence === 'number')
            ? { targetConfidence: riskCandidate.ai_metadata.confidence }
            : {}),
        };
      }

      const targetUtteranceId = item.id.startsWith('collecting')
        ? nextUntranscribed?.id
        : item.id.startsWith('transcribing')
          ? nextUnglossed?.id
          : nextUnverified?.id;

      return {
        ...item,
        actionType: 'jump',
        ...(targetUtteranceId ? { targetUtteranceId } : {}),
      };
    });
  }, [observerResult.recommendations, utterances]);

  // ── AI-derived values ──
  const selectedAiWarning = useMemo(() => {
    if (selectedUtteranceText.trim().length <= 1) return false;
    return lexemeMatches.length === 0;
  }, [lexemeMatches.length, selectedUtteranceText]);

  const selectedTranslationGapCount = useMemo(() => {
    if (!selectedUtterance || translationLayers.length === 0) return 0;

    let missing = 0;
    for (const layer of translationLayers) {
      const draftKey = `${layer.id}-${selectedUtterance.id}`;
      const draft = translationDrafts[draftKey];
      const persisted = translationTextByLayer.get(layer.id)?.get(selectedUtterance.id)?.text ?? '';
      const text = (draft ?? persisted).trim();
      if (text.length === 0) {
        missing += 1;
      }
    }
    return missing;
  }, [selectedUtterance, translationDrafts, translationLayers, translationTextByLayer]);

  const nextTranslationGapUtteranceId = useMemo(() => {
    if (translationLayers.length === 0) return undefined;

    for (const utterance of utterances) {
      const hasGap = translationLayers.some((layer) => {
        const draftKey = `${layer.id}-${utterance.id}`;
        const draft = translationDrafts[draftKey];
        const persisted = translationTextByLayer.get(layer.id)?.get(utterance.id)?.text ?? '';
        const text = (draft ?? persisted);
        return text.trim().length === 0;
      });
      if (hasGap) return utterance.id;
    }
    return undefined;
  }, [translationDrafts, translationLayers, translationTextByLayer, utterances]);

  const aiCurrentTask = useMemo<AiPanelTask>(() => {
    if (aiChatConnectionTestStatus === 'error') return 'ai_chat_setup';

    if (!selectedUtterance) {
      return observerResult.stage === 'collecting' ? 'segmentation' : 'transcription';
    }

    const confidence = selectedUtterance.ai_metadata?.confidence;
    if (selectedAiWarning || (typeof confidence === 'number' && confidence < 0.7)) {
      return 'risk_review';
    }

    if (selectedTranslationGapCount > 0) {
      return 'translation';
    }

    const hasUntaggedPos = Array.isArray(selectedUtterance.words)
      && selectedUtterance.words.some((word) => (word.pos ?? '').trim().length === 0);
    if (hasUntaggedPos) {
      return 'pos_tagging';
    }

    if (observerResult.stage === 'collecting') {
      return selectedUtteranceText.trim().length > 0 ? 'transcription' : 'segmentation';
    }
    if (observerResult.stage === 'transcribing') {
      return 'transcription';
    }
    if (observerResult.stage === 'glossing') {
      return 'glossing';
    }
    return 'risk_review';
  }, [
    aiChatConnectionTestStatus,
    observerResult.stage,
    selectedAiWarning,
    selectedTranslationGapCount,
    selectedUtterance,
    selectedUtteranceText,
  ]);

  const aiVisibleCards = useMemo<Record<AiPanelCardKey, boolean>>(() => {
    const allVisible: Record<AiPanelCardKey, boolean> = {
      ai_chat: true,
      embedding_ops: true,
      task_observer: true,
      translation_focus: true,
      generation_status: true,
      context_analysis: true,
      dictionary_matches: true,
      token_notes: true,
      pos_tagging: true,
      phoneme_consistency: true,
    };

    if (aiPanelMode === 'all') return allVisible;

    const byTask: Record<AiPanelTask, Record<AiPanelCardKey, boolean>> = {
      segmentation: {
        ai_chat: true,
        embedding_ops: true,
        task_observer: true,
        translation_focus: false,
        generation_status: true,
        context_analysis: true,
        dictionary_matches: false,
        token_notes: false,
        pos_tagging: false,
        phoneme_consistency: false,
      },
      transcription: {
        ai_chat: true,
        embedding_ops: true,
        task_observer: true,
        translation_focus: false,
        generation_status: true,
        context_analysis: true,
        dictionary_matches: true,
        token_notes: true,
        pos_tagging: false,
        phoneme_consistency: true,
      },
      translation: {
        ai_chat: true,
        embedding_ops: true,
        task_observer: true,
        translation_focus: true,
        generation_status: false,
        context_analysis: true,
        dictionary_matches: false,
        token_notes: false,
        pos_tagging: false,
        phoneme_consistency: false,
      },
      pos_tagging: {
        ai_chat: true,
        embedding_ops: true,
        task_observer: true,
        translation_focus: false,
        generation_status: true,
        context_analysis: false,
        dictionary_matches: true,
        token_notes: true,
        pos_tagging: true,
        phoneme_consistency: false,
      },
      glossing: {
        ai_chat: true,
        embedding_ops: true,
        task_observer: true,
        translation_focus: false,
        generation_status: true,
        context_analysis: true,
        dictionary_matches: true,
        token_notes: true,
        pos_tagging: true,
        phoneme_consistency: false,
      },
      risk_review: {
        ai_chat: true,
        embedding_ops: true,
        task_observer: true,
        translation_focus: false,
        generation_status: true,
        context_analysis: true,
        dictionary_matches: true,
        token_notes: true,
        pos_tagging: false,
        phoneme_consistency: false,
      },
      ai_chat_setup: {
        ai_chat: true,
        embedding_ops: true,
        task_observer: false,
        translation_focus: false,
        generation_status: false,
        context_analysis: false,
        dictionary_matches: false,
        token_notes: false,
        pos_tagging: false,
        phoneme_consistency: false,
      },
    };

    return byTask[aiCurrentTask];
  }, [aiCurrentTask, aiPanelMode]);

  const handleJumpToTranslationGap = useCallback(() => {
    if (!nextTranslationGapUtteranceId) {
      reportValidationError({
        message: '当前没有待补全翻译的语段',
        i18nKey: 'transcription.error.validation.translationGapNotFound',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    selectUtterance(nextTranslationGapUtteranceId);
    setSaveState({ kind: 'done', message: '已跳转到翻译缺口语段' });
  }, [nextTranslationGapUtteranceId, selectUtterance, setSaveState]);

  return {
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    nextTranslationGapUtteranceId,
    aiCurrentTask,
    aiVisibleCards,
    handleJumpToTranslationGap,
  };
}
