import { useCallback, useEffect, useMemo } from 'react';
import { DEFAULT_VOICE_INTENT_RESOLVER_CONFIG } from '../ai/config/voiceIntentResolver';
import { featureFlags } from '../ai/config/featureFlags';
import { getDb, type UtteranceDocType } from '../db';
import { getUtteranceDocProjectionById } from '../services/LayerSegmentGraphService';
import { LinguisticService } from '../services/LinguisticService';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import { isSegmentTimelineUnit } from '../hooks/transcriptionTypes';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { VoiceSession } from '../services/IntentRouter';
import { fireAndForget } from '../utils/fireAndForget';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import { bridgeVoiceDictationText, createVoiceDictationPipeline, persistVoiceDictationToUtterance, resolveVoiceDictationTarget } from './voiceDictationRuntime';
import { buildTranscriptionAssistantContextValue } from './transcriptionAssistantContextValue';
import type {
  UseTranscriptionAssistantControllerInput,
  UseTranscriptionAssistantControllerResult,
} from './transcriptionAssistantController.types';
import { t, useLocale } from '../i18n';
export function useTranscriptionAssistantController(input: UseTranscriptionAssistantControllerInput): UseTranscriptionAssistantControllerResult {
  const locale = useLocale();
  const { pushUndo, setUtterances, setSaveState } = input;
  const aiPanelContextValue = useMemo<AiPanelContextValue>(() => buildTranscriptionAssistantContextValue(input), [
    input.aiConfidenceAvg,
    input.aiCurrentTask,
    input.aiPanelMode,
    input.aiVisibleCards,
    input.handleBatchUpdateTokenPosByForm,
    input.handleJumpToTranslationGap,
    input.handleOpenMorphemeNote,
    input.handleOpenWordNote,
    input.handleUpdateTokenPos,
    input.lexemeMatches,
    input.selectedAiWarning,
    input.selectedPrimaryUnitView,
    input.selectedTimelineRowMeta,
    input.selectedTranslationGapCount,
    input.setAiPanelMode,
    input.state.dbName,
    input.state.phase,
    input.translationLayersLength,
    input.unitsLength,
    input.vadCacheStatus,
    input.acousticRuntimeStatus,
    input.acousticSummary,
    input.acousticInspector,
    input.pinnedInspector,
    input.selectedHotspotTimeSec,
    input.acousticDetail,
    input.acousticDetailFullMedia,
    input.acousticBatchDetails,
    input.acousticBatchSelectionCount,
    input.acousticBatchDroppedSelectionRanges,
    input.acousticCalibrationStatus,
    input.acousticConfigOverride,
    input.acousticProviderPreference,
    input.acousticProviderState,
    input.handleJumpToAcousticHotspot,
    input.handlePinInspector,
    input.handleClearPinnedInspector,
    input.handleSelectHotspot,
    input.handleChangeAcousticConfig,
    input.handleResetAcousticConfig,
    input.handleChangeAcousticProvider,
    input.handleRefreshAcousticProviderState,
  ]);

  useEffect(() => {
    input.setAiPanelContext(aiPanelContextValue);
  }, [aiPanelContextValue, input.setAiPanelContext]);

  const handleResolveVoiceIntentWithLlm = useCallback(async ({
    text,
    mode,
    session,
  }: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => {
    if (!featureFlags.aiChatEnabled || !input.aiChatEnabled) {
      return null;
    }
    const { resolveVoiceIntentWithLlmUsingConfig } = await import('../services/VoiceIntentLlmResolver');
    const resolved = await resolveVoiceIntentWithLlmUsingConfig({
      transcript: text,
      mode,
      settings: input.aiChatSettings,
      recentContext: session.entries
        .slice(-4)
        .map((entry) => `[${entry.intent.type}] ${entry.sttText}`),
    }, DEFAULT_VOICE_INTENT_RESOLVER_CONFIG);

    if (resolved.ok) {
      return resolved.intent;
    }
    throw new Error(resolved.message);
  }, [input.aiChatEnabled, input.aiChatSettings]);

  const handleVoiceDictation = useCallback((text: string) => {
    if (isSegmentTimelineUnit(input.selectedTimelineUnit)) {
      const selectedTimelineUnit = input.selectedTimelineUnit;
      fireAndForget((async () => {
        const transformedText = await bridgeVoiceDictationText({
          text,
          targetLayerId: selectedTimelineUnit.layerId,
          selectedLayerId: input.selectedLayerId,
          layers: input.layers,
        });
        await input.saveSegmentContentForLayer(selectedTimelineUnit.unitId, selectedTimelineUnit.layerId, transformedText);
      })());
      return;
    }
    const targetUtterance = input.selectedTimelineOwnerUnit;
    if (!targetUtterance) {
      reportValidationError({
        message: '\u8bf7\u5148\u9009\u62e9\u8981\u586b\u5145\u7684\u53e5\u6bb5',
        i18nKey: 'transcription.error.validation.voiceDictationUtteranceRequired',
        setErrorState: ({ message, meta }) => input.setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const resolvedTarget = resolveVoiceDictationTarget({
      selectedLayerId: input.selectedLayerId,
      ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
      translationLayers: input.translationLayers,
      layers: input.layers,
    });
    if (!resolvedTarget) {
      reportValidationError({
        message: '\u65e0\u53ef\u7528\u5c42，\u8bf7\u5148\u521b\u5efa\u8f6c\u5199\u6216\u7ffb\u8bd1\u5c42',
        i18nKey: 'transcription.error.validation.voiceDictationLayerRequired',
        setErrorState: ({ message, meta }) => input.setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const { targetLayerId, targetLayer } = resolvedTarget;
    const persistAndAdvance = async (persist: () => Promise<void>) => {
      await persist();
      if (!input.nextUtteranceIdForVoiceDictation) return;
      input.selectUnit(input.nextUtteranceIdForVoiceDictation);
    };
    fireAndForget(persistAndAdvance(async () => {
      await persistVoiceDictationToUtterance({
        utteranceId: targetUtterance.id,
        text,
        targetLayerId,
        targetLayer,
        selectedLayerId: input.selectedLayerId,
        layers: input.layers,
        saveUtteranceText: input.saveUtteranceText,
        saveTextTranslationForUtterance: input.saveTextTranslationForUtterance,
      });
    }));
  }, [
    input.layers,
    input.defaultTranscriptionLayerId,
    input.nextUtteranceIdForVoiceDictation,
    input.saveSegmentContentForLayer,
    input.saveTextTranslationForUtterance,
    input.saveUtteranceText,
    input.selectUnit,
    input.selectedLayerId,
    input.selectedTimelineOwnerUnit,
    input.selectedTimelineUnit,
    input.setSaveState,
    input.translationLayers,
  ]);

  const voiceDictationPipeline = useMemo<UseTranscriptionAssistantControllerResult['voiceDictationPipeline']>(() => {
    if (isSegmentTimelineUnit(input.selectedTimelineUnit)) return undefined;
    return createVoiceDictationPipeline({
      selectedLayerId: input.selectedLayerId,
      ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
      translationLayers: input.translationLayers,
      layers: input.layers,
      selectedTimelineOwnerUnit: input.selectedTimelineOwnerUnit,
      utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
      getUtteranceTextForLayer: input.getUtteranceTextForLayer,
      selectUnit: input.selectUnit,
      saveUtteranceText: input.saveUtteranceText,
      saveTextTranslationForUtterance: input.saveTextTranslationForUtterance,
    });
  }, [
    input.defaultTranscriptionLayerId,
    input.getUtteranceTextForLayer,
    input.layers,
    input.saveTextTranslationForUtterance,
    input.saveUtteranceText,
    input.selectUnit,
    input.selectedLayerId,
    input.selectedTimelineOwnerUnit,
    input.selectedTimelineUnit,
    input.translationLayers,
    input.utterancesOnCurrentMedia,
  ]);

  const handleVoiceAnalysisResult = useCallback(async (utteranceId: string | null, analysisText: string) => {
    if (!utteranceId) {
      const message = t(locale, 'transcription.error.validation.voiceAnalysisUtteranceRequired');
      reportValidationError({
        message,
        i18nKey: 'transcription.error.validation.voiceAnalysisUtteranceRequired',
        setErrorState: ({ message: nextMessage, meta }) => setSaveState({ kind: 'error', message: nextMessage, errorMeta: meta }),
      });
      return { ok: false, message };
    }
    const trimmed = analysisText.trim();
    if (!trimmed) {
      const message = t(locale, 'transcription.assistant.voiceAnalysis.empty');
      return { ok: false, message };
    }
    try {
      const db = await getDb();
      const doc = await getUtteranceDocProjectionById(db, utteranceId);
      if (!doc) {
        const message = t(locale, 'transcription.error.validation.voiceAnalysisTargetMissing');
        reportValidationError({
          message,
          i18nKey: 'transcription.error.validation.voiceAnalysisTargetMissing',
          setErrorState: ({ message: nextMessage, meta }) => setSaveState({ kind: 'error', message: nextMessage, errorMeta: meta }),
        });
        return { ok: false, message };
      }
      pushUndo(t(locale, 'transcription.assistant.undo.fillAnalysis'));
      const now = new Date().toISOString();
      const existingNotes = doc.notes ?? {};
      const updated: UtteranceDocType = {
        ...doc,
        notes: { ...existingNotes, eng: trimmed },
        updatedAt: now,
      };
      await LinguisticService.saveUtterance(updated);
      setUtterances((prev) => prev.map((item) => (item.id === utteranceId ? updated : item)));
      const message = t(locale, 'transcription.assistant.voiceAnalysis.saved');
      setSaveState({ kind: 'done', message });
      return { ok: true, message };
    } catch (error) {
      reportActionError({
        actionLabel: t(locale, 'transcription.assistant.voiceAnalysis.actionLabelSave'),
        error,
        i18nKey: 'transcription.error.action.voiceAnalysisSaveFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return {
        ok: false,
        message: error instanceof Error ? error.message : t(locale, 'transcription.assistant.voiceAnalysis.saveFailedFallback'),
      };
    }
  }, [locale, pushUndo, setSaveState, setUtterances]);

  return {
    aiPanelContextValue,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    ...(voiceDictationPipeline !== undefined ? { voiceDictationPipeline } : {}),
    handleVoiceAnalysisResult,
  };
}