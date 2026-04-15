import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiPanelCardKey, AiPanelMode, AiPanelTask } from '../components/AiAnalysisPanel';
import { LinguisticService } from '../services/LinguisticService';
import { ProjectObserver, type Recommendation } from '../ai/ProjectObserver';
import type { AiSystemPersonaKey } from './useAiChat';
import type { VadCacheStatus } from '../contexts/AiPanelContext';

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
import { buildWaveformAnalysisOverlaySummary, buildWaveformAnalysisPromptSummary } from '../utils/waveformAnalysisOverlays';
import { useVadCacheEntry } from './useVadCachedSegments';
import { useVadCacheWarmupStatus } from './useVadCacheWarmupStatus';
import { t, type Locale } from '../i18n';

type ActionableRecommendation = Recommendation & {
  actionType?: 'jump' | 'batch_pos' | 'risk_review';
  targetUtteranceId?: string;
  targetForm?: string;
  targetPos?: string;
  targetConfidence?: number;
};

const RECOMMENDATION_I18N_KEY_BY_ID = {
  'collecting-next': {
    title: 'ai.observer.recommendation.collectingNext.title',
    detail: 'ai.observer.recommendation.collectingNext.detail',
    actionLabel: 'ai.observer.recommendation.collectingNext.actionLabel',
  },
  'collecting-risk-review': {
    title: 'ai.observer.recommendation.collectingRiskReview.title',
    detail: 'ai.observer.recommendation.collectingRiskReview.detail',
    actionLabel: 'ai.observer.recommendation.collectingRiskReview.actionLabel',
  },
  'transcribing-jump-untagged': {
    title: 'ai.observer.recommendation.transcribingJumpUntagged.title',
    detail: 'ai.observer.recommendation.transcribingJumpUntagged.detail',
    actionLabel: 'ai.observer.recommendation.transcribingJumpUntagged.actionLabel',
  },
  'transcribing-risk-review': {
    title: 'ai.observer.recommendation.transcribingRiskReview.title',
    detail: 'ai.observer.recommendation.transcribingRiskReview.detail',
    actionLabel: 'ai.observer.recommendation.transcribingRiskReview.actionLabel',
  },
  'transcribing-batch-pos': {
    title: 'ai.observer.recommendation.transcribingBatchPos.title',
    detail: 'ai.observer.recommendation.transcribingBatchPos.detail',
    actionLabel: 'ai.observer.recommendation.transcribingBatchPos.actionLabel',
  },
  'glossing-risk-review': {
    title: 'ai.observer.recommendation.glossingRiskReview.title',
    detail: 'ai.observer.recommendation.glossingRiskReview.detail',
    actionLabel: 'ai.observer.recommendation.glossingRiskReview.actionLabel',
  },
  'glossing-next': {
    title: 'ai.observer.recommendation.glossingNext.title',
    detail: 'ai.observer.recommendation.glossingNext.detail',
    actionLabel: 'ai.observer.recommendation.glossingNext.actionLabel',
  },
  'reviewing-risk-review': {
    title: 'ai.observer.recommendation.reviewingRiskReview.title',
    detail: 'ai.observer.recommendation.reviewingRiskReview.detail',
    actionLabel: 'ai.observer.recommendation.reviewingRiskReview.actionLabel',
  },
  'reviewing-next': {
    title: 'ai.observer.recommendation.reviewingNext.title',
    detail: 'ai.observer.recommendation.reviewingNext.detail',
    actionLabel: 'ai.observer.recommendation.reviewingNext.actionLabel',
  },
} as const;

function localizeRecommendation(locale: Locale, recommendation: Recommendation): Recommendation {
  const keys = RECOMMENDATION_I18N_KEY_BY_ID[recommendation.id as keyof typeof RECOMMENDATION_I18N_KEY_BY_ID];
  if (!keys) return recommendation;
  return {
    ...recommendation,
    title: t(locale, keys.title),
    detail: t(locale, keys.detail),
    actionLabel: t(locale, keys.actionLabel),
  };
}

export type { ActionableRecommendation };

export interface UseAiPanelLogicInput {
  locale: Locale;
  utterances: UtteranceDocType[];
  selectedUnit: UtteranceDocType | undefined;
  selectedUnitText: string;
  translationLayers: Array<{ id: string; key: string }>;
  translationDrafts: Record<string, string>;
  translationTextByLayer: Map<string, Map<string, { text?: string }>>;
  aiChatConnectionTestStatus: string;
  aiPanelMode: AiPanelMode;
  selectUnit: (id: string) => void;
  setSaveState: (s: SaveState) => void;
  /** 当前媒体 ID，用于读取 VAD 缓存 | Current media ID for VAD cache lookup */
  mediaId?: string;
}

export function useAiPanelLogic({
  locale,
  utterances,
  selectedUnit,
  selectedUnitText,
  translationLayers,
  translationDrafts,
  translationTextByLayer,
  aiChatConnectionTestStatus,
  aiPanelMode,
  selectUnit,
  setSaveState,
  mediaId,
}: UseAiPanelLogicInput) {
  // ── Lexeme search ──
  const [lexemeMatches, setLexemeMatches] = useState<Array<{ id: string; lemma: Record<string, string> }>>([]);
  const lexemeSearchRequestRef = useRef(0);

  useEffect(() => {
    const query = selectedUnitText.trim();
    if (!query) {
      lexemeSearchRequestRef.current += 1;
      setLexemeMatches([]);
      return;
    }

    const token = query.split(/\s+/).filter(Boolean)[0] ?? '';
    if (!token) {
      lexemeSearchRequestRef.current += 1;
      setLexemeMatches([]);
      return;
    }

    const requestId = lexemeSearchRequestRef.current + 1;
    lexemeSearchRequestRef.current = requestId;
    const timer = window.setTimeout(() => {
      void LinguisticService.searchLexemes(token)
        .then((items) => {
          if (lexemeSearchRequestRef.current !== requestId) return;
          setLexemeMatches(items.slice(0, 8));
        })
        .catch(() => {
          if (lexemeSearchRequestRef.current !== requestId) return;
          setLexemeMatches([]);
        });
    }, 120);

    return () => {
      lexemeSearchRequestRef.current += 1;
      window.clearTimeout(timer);
    };
  }, [selectedUnit?.id, selectedUnitText]);

  const vadCacheEntry = useVadCacheEntry(mediaId);
  const vadWarmupStatus = useVadCacheWarmupStatus(mediaId);
  const vadSegments = vadCacheEntry?.segments;
  const vadCacheStatus = useMemo<VadCacheStatus>(() => {
    if (!mediaId) {
      return { state: 'unavailable' };
    }
    if (!vadCacheEntry) {
      if (vadWarmupStatus?.state === 'warming') {
        const engine = vadWarmupStatus.engine;
        return {
          state: 'warming',
          ...(engine !== undefined ? { engine } : {}),
          progressRatio: vadWarmupStatus.progressRatio,
          processedFrames: vadWarmupStatus.processedFrames,
          totalFrames: vadWarmupStatus.totalFrames,
        };
      }
      return { state: 'missing' };
    }
    return {
      state: 'ready',
      engine: vadCacheEntry.engine,
      segmentCount: vadCacheEntry.segments.length,
    };
  }, [mediaId, vadCacheEntry, vadWarmupStatus]);

  const waveformAnalysisOverlaySummary = useMemo(() => buildWaveformAnalysisOverlaySummary(utterances, {
    ...(vadSegments ? { vadSegments } : {}),
  }), [utterances, vadSegments]);

  const waveformAnalysisSummary = useMemo(() => buildWaveformAnalysisPromptSummary(utterances, {
    ...(selectedUnit ? { selectionStartTime: selectedUnit.startTime, selectionEndTime: selectedUnit.endTime } : {}),
    ...(vadSegments ? { vadSegments } : {}),
  }), [selectedUnit, utterances, vadSegments]);

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
      utteranceRowCount: total,
      transcribedRate: total === 0 ? 0 : transcribed / total,
      glossedRate: total === 0 ? 0 : glossed / total,
      verifiedRate: total === 0 ? 0 : verified / total,
    }, {
      lowConfidenceCount: waveformAnalysisSummary.lowConfidenceCount,
      overlapCount: waveformAnalysisSummary.overlapCount,
      gapCount: waveformAnalysisSummary.gapCount,
      maxGapSeconds: waveformAnalysisSummary.maxGapSeconds,
      ...(waveformAnalysisSummary.hotZones?.[0] ? { topHotZoneSeverity: waveformAnalysisSummary.hotZones[0].severity } : {}),
    }, locale);
  }, [locale, observer, utterances, waveformAnalysisSummary]);

  // ── Actionable recommendations ──
  const actionableObserverRecommendations = useMemo(() => {
    const orderedUtterances = [...utterances].sort((left, right) => {
      if (left.startTime !== right.startTime) return left.startTime - right.startTime;
      if (left.endTime !== right.endTime) return left.endTime - right.endTime;
      return left.id.localeCompare(right.id);
    });
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

    const overlapCandidate = (() => {
      const firstBand = waveformAnalysisOverlaySummary.overlapBands[0];
      if (!firstBand) return undefined;
      return orderedUtterances.find((utterance) => utterance.startTime < firstBand.endTime && utterance.endTime > firstBand.startTime);
    })();

    const gapCandidate = (() => {
      const firstBand = waveformAnalysisOverlaySummary.gapBands[0];
      if (!firstBand) return undefined;
      return orderedUtterances.find((utterance) => utterance.startTime >= firstBand.endTime - 0.0005);
    })();

    const hasWaveformRiskSignals = waveformAnalysisSummary.lowConfidenceCount > 0
      || waveformAnalysisSummary.overlapCount > 0
      || waveformAnalysisSummary.gapCount > 0;

    const hasSelectedWaveformRisk = (waveformAnalysisSummary.selectionLowConfidenceCount ?? 0) > 0
      || (waveformAnalysisSummary.selectionOverlapCount ?? 0) > 0
      || (waveformAnalysisSummary.selectionGapCount ?? 0) > 0;

    const riskTargetUtterance = hasSelectedWaveformRisk && selectedUnit
      ? selectedUnit
      : riskCandidate ?? overlapCandidate ?? gapCandidate;

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

    const prioritizedRecommendations = [
      ...((hasWaveformRiskSignals && observerResult.stage === 'collecting')
        ? [{
          id: 'collecting-risk-review',
          priority: 104,
          title: '',
          detail: '',
          actionLabel: '',
        }]
        : []),
      ...((hasWaveformRiskSignals && observerResult.stage === 'transcribing')
        ? [{
          id: 'transcribing-risk-review',
          priority: 96,
          title: '',
          detail: '',
          actionLabel: '',
        }]
        : []),
      ...observerResult.recommendations,
    ].sort((left, right) => right.priority - left.priority);

    return prioritizedRecommendations.map((item): ActionableRecommendation => {
      const localizedItem = localizeRecommendation(locale, item);

      if (localizedItem.id === 'transcribing-batch-pos') {
        return {
          ...localizedItem,
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

      if (localizedItem.id === 'transcribing-jump-untagged') {
        return {
          ...localizedItem,
          actionType: 'jump',
          ...(nextUntaggedPosUtterance ? { targetUtteranceId: nextUntaggedPosUtterance.id } : {}),
        };
      }

      if (
        localizedItem.id === 'collecting-risk-review'
        || localizedItem.id === 'transcribing-risk-review'
        || localizedItem.id === 'glossing-risk-review'
        || localizedItem.id === 'reviewing-risk-review'
      ) {
        return {
          ...localizedItem,
          actionType: 'risk_review',
          ...(riskTargetUtterance ? { targetUtteranceId: riskTargetUtterance.id } : {}),
          ...((riskTargetUtterance && typeof riskTargetUtterance.ai_metadata?.confidence === 'number')
            ? { targetConfidence: riskTargetUtterance.ai_metadata.confidence }
            : {}),
        };
      }

      const targetUtteranceId = localizedItem.id.startsWith('collecting')
        ? nextUntranscribed?.id
        : localizedItem.id.startsWith('transcribing')
          ? nextUnglossed?.id
          : nextUnverified?.id;

      return {
        ...localizedItem,
        actionType: 'jump',
        ...(targetUtteranceId ? { targetUtteranceId } : {}),
      };
    });
  }, [locale, observerResult.recommendations, observerResult.stage, selectedUnit, utterances, waveformAnalysisOverlaySummary.gapBands, waveformAnalysisOverlaySummary.overlapBands, waveformAnalysisSummary.gapCount, waveformAnalysisSummary.lowConfidenceCount, waveformAnalysisSummary.overlapCount, waveformAnalysisSummary.selectionGapCount, waveformAnalysisSummary.selectionLowConfidenceCount, waveformAnalysisSummary.selectionOverlapCount]);

  // ── AI-derived values ──
  const selectedAiWarning = useMemo(() => {
    if (selectedUnitText.trim().length <= 1) return false;
    return lexemeMatches.length === 0;
  }, [lexemeMatches.length, selectedUnitText]);

  const selectedTranslationGapCount = useMemo(() => {
    if (!selectedUnit || translationLayers.length === 0) return 0;

    let missing = 0;
    for (const layer of translationLayers) {
      const draftKey = `${layer.id}-${selectedUnit.id}`;
      const draft = translationDrafts[draftKey];
      const persisted = translationTextByLayer.get(layer.id)?.get(selectedUnit.id)?.text ?? '';
      const text = (draft ?? persisted).trim();
      if (text.length === 0) {
        missing += 1;
      }
    }
    return missing;
  }, [selectedUnit, translationDrafts, translationLayers, translationTextByLayer]);

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

    if (!selectedUnit) {
      return observerResult.stage === 'collecting' ? 'segmentation' : 'transcription';
    }

    const confidence = selectedUnit.ai_metadata?.confidence;
    const selectedWaveformRisk = (waveformAnalysisSummary.selectionLowConfidenceCount ?? 0) > 0
      || (waveformAnalysisSummary.selectionOverlapCount ?? 0) > 0
      || (waveformAnalysisSummary.selectionGapCount ?? 0) > 0;

    if (selectedAiWarning || selectedWaveformRisk || (typeof confidence === 'number' && confidence < 0.7)) {
      return 'risk_review';
    }

    if (selectedTranslationGapCount > 0) {
      return 'translation';
    }

    const hasUntaggedPos = Array.isArray(selectedUnit.words)
      && selectedUnit.words.some((word) => (word.pos ?? '').trim().length === 0);
    if (hasUntaggedPos) {
      return 'pos_tagging';
    }

    if (observerResult.stage === 'collecting') {
      return selectedUnitText.trim().length > 0 ? 'transcription' : 'segmentation';
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
    selectedUnit,
    selectedUnitText,
    waveformAnalysisSummary.selectionGapCount,
    waveformAnalysisSummary.selectionLowConfidenceCount,
    waveformAnalysisSummary.selectionOverlapCount,
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
        message: t(locale, 'transcription.ai.translationGap.nonePending'),
        i18nKey: 'transcription.error.validation.translationGapNotFound',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    selectUnit(nextTranslationGapUtteranceId);
    setSaveState({ kind: 'done', message: t(locale, 'transcription.ai.translationGap.jumped') });
  }, [locale, nextTranslationGapUtteranceId, selectUnit, setSaveState]);

  return {
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    nextTranslationGapUtteranceId,
    aiCurrentTask,
    aiVisibleCards,
    vadCacheStatus,
    handleJumpToTranslationGap,
  };
}
