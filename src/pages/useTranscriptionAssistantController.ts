import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_VOICE_INTENT_RESOLVER_CONFIG } from '../ai/config/voiceIntentResolver';
import { featureFlags } from '../ai/config/featureFlags';
import { getDb, type LayerDocType, type UtteranceDocType } from '../db';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { isSegmentTimelineUnit } from '../hooks/transcriptionTypes';
import type { AiChatSettings } from '../hooks/useAiChat';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import { fireAndForget } from '../utils/fireAndForget';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import { transformTextForLayerTarget } from '../utils/orthographyRuntime';
interface SelectedRowMetaLike {
  rowNumber: number;
  start: number;
  end: number;
}

interface ReadyStateLike {
  phase: string;
  dbName?: string;
  utteranceCount?: number;
  translationLayerCount?: number;
}
interface UseTranscriptionAssistantControllerInput {
  state: ReadyStateLike;
  utterancesLength: number;
  translationLayersLength: number;
  aiConfidenceAvg: number | null;
  selectedTimelineOwnerUtterance: UtteranceDocType | null;
  selectedTimelineRowMeta: SelectedRowMetaLike | null;
  selectedAiWarning: boolean;
  lexemeMatches: AiPanelContextValue['lexemeMatches'];
  handleOpenWordNote: AiPanelContextValue['onOpenWordNote'];
  handleOpenMorphemeNote: AiPanelContextValue['onOpenMorphemeNote'];
  handleUpdateTokenPos: AiPanelContextValue['onUpdateTokenPos'];
  handleBatchUpdateTokenPosByForm: AiPanelContextValue['onBatchUpdateTokenPosByForm'];
  aiPanelMode: NonNullable<AiPanelContextValue['aiPanelMode']>;
  setAiPanelMode: Dispatch<SetStateAction<NonNullable<AiPanelContextValue['aiPanelMode']>>>;
  aiCurrentTask: AiPanelContextValue['aiCurrentTask'];
  aiVisibleCards: AiPanelContextValue['aiVisibleCards'];
  selectedTranslationGapCount: number;
  handleJumpToTranslationGap: NonNullable<AiPanelContextValue['onJumpToTranslationGap']>;
  setAiPanelContext: Dispatch<SetStateAction<AiPanelContextValue>>;
  selectedTimelineUnit: TimelineUnit | null;
  saveSegmentContentForLayer: (segmentId: string, layerId: string, value: string) => Promise<void>;
  selectedLayerId: string | null;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  setSaveState: (state: SaveState) => void;
  nextUtteranceIdForVoiceDictation?: string;
  selectUtterance: (utteranceId: string) => void;
  aiChatEnabled: boolean;
  aiChatSettings: AiChatSettings;
  pushUndo: (label: string) => void;
  setUtterances: Dispatch<SetStateAction<UtteranceDocType[]>>;
}

interface UseTranscriptionAssistantControllerResult {
  aiPanelContextValue: AiPanelContextValue;
  handleResolveVoiceIntentWithLlm: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  handleVoiceDictation: (text: string) => void;
  handleVoiceAnalysisResult: (utteranceId: string | null, analysisText: string) => Promise<{ ok: boolean; message: string }>;
}
export function useTranscriptionAssistantController(
  input: UseTranscriptionAssistantControllerInput,
): UseTranscriptionAssistantControllerResult {
  const { pushUndo, setUtterances, setSaveState } = input;
  const aiPanelContextValue = useMemo<AiPanelContextValue>(() => ({
    dbName: input.state.phase === 'ready' ? input.state.dbName ?? '' : '',
    utteranceCount: input.state.phase === 'ready'
      ? input.state.utteranceCount ?? input.utterancesLength
      : input.utterancesLength,
    translationLayerCount: input.state.phase === 'ready'
      ? input.state.translationLayerCount ?? input.translationLayersLength
      : input.translationLayersLength,
    aiConfidenceAvg: input.aiConfidenceAvg,
    selectedUtterance: input.selectedTimelineOwnerUtterance,
    selectedRowMeta: input.selectedTimelineRowMeta,
    selectedAiWarning: input.selectedAiWarning,
    lexemeMatches: input.lexemeMatches,
    aiPanelMode: input.aiPanelMode,
    selectedTranslationGapCount: input.selectedTranslationGapCount,
    onJumpToTranslationGap: input.handleJumpToTranslationGap,
    onChangeAiPanelMode: input.setAiPanelMode,
    ...(input.handleOpenWordNote ? { onOpenWordNote: input.handleOpenWordNote } : {}),
    ...(input.handleOpenMorphemeNote ? { onOpenMorphemeNote: input.handleOpenMorphemeNote } : {}),
    ...(input.handleUpdateTokenPos ? { onUpdateTokenPos: input.handleUpdateTokenPos } : {}),
    ...(input.handleBatchUpdateTokenPosByForm ? { onBatchUpdateTokenPosByForm: input.handleBatchUpdateTokenPosByForm } : {}),
    ...(input.aiCurrentTask ? { aiCurrentTask: input.aiCurrentTask } : {}),
    ...(input.aiVisibleCards ? { aiVisibleCards: input.aiVisibleCards } : {}),
  }), [
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
    input.selectedTimelineOwnerUtterance,
    input.selectedTimelineRowMeta,
    input.selectedTranslationGapCount,
    input.setAiPanelMode,
    input.state.dbName,
    input.state.phase,
    input.state.translationLayerCount,
    input.state.utteranceCount,
    input.translationLayersLength,
    input.utterancesLength,
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
      fireAndForget((async () => {
        const fallbackSourceOrthographyId = input.selectedLayerId ? undefined : input.layers.find((layer) => layer.layerType === 'transcription')?.orthographyId;
        const transformedText = await transformTextForLayerTarget({
          text,
          layers: input.layers,
          targetLayerId: input.selectedTimelineUnit.layerId,
          selectedLayerId: input.selectedLayerId,
          ...(fallbackSourceOrthographyId !== undefined ? { fallbackSourceOrthographyId } : {}),
        });
        await input.saveSegmentContentForLayer(input.selectedTimelineUnit.unitId, input.selectedTimelineUnit.layerId, transformedText);
      })());
      return;
    }
    const targetUtterance = input.selectedTimelineOwnerUtterance;
    if (!targetUtterance) {
      reportValidationError({
        message: '请先选择要填充的句段',
        i18nKey: 'transcription.error.validation.voiceDictationUtteranceRequired',
        setErrorState: ({ message, meta }) => input.setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    let targetLayerId: string | undefined = input.selectedLayerId ?? undefined;
    if (!targetLayerId) {
      targetLayerId = input.translationLayers[0]?.id;
    }
    if (!targetLayerId) {
      reportValidationError({
        message: '无可用层，请先创建转写或翻译层',
        i18nKey: 'transcription.error.validation.voiceDictationLayerRequired',
        setErrorState: ({ message, meta }) => input.setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const targetLayer = input.layers.find((layer) => layer.id === targetLayerId);
    if (!targetLayer) return;
    const fallbackSourceOrthographyId = input.selectedLayerId
      ? undefined
      : input.layers.find((layer) => layer.layerType === 'transcription')?.orthographyId;
    const persistAndAdvance = async (persist: () => Promise<void>) => {
      await persist();
      if (!input.nextUtteranceIdForVoiceDictation) return;
      input.selectUtterance(input.nextUtteranceIdForVoiceDictation);
    };
    if (targetLayer.layerType === 'transcription') {
      fireAndForget(persistAndAdvance(async () => {
        const transformedText = await transformTextForLayerTarget({
          text,
          layers: input.layers,
          targetLayerId,
          selectedLayerId: input.selectedLayerId,
          ...(fallbackSourceOrthographyId !== undefined ? { fallbackSourceOrthographyId } : {}),
        });
        await input.saveUtteranceText(targetUtterance.id, transformedText, targetLayerId);
      }));
      return;
    }
    fireAndForget(persistAndAdvance(async () => {
      const transformedText = await transformTextForLayerTarget({
        text,
        layers: input.layers,
        targetLayerId,
        selectedLayerId: input.selectedLayerId,
        ...(fallbackSourceOrthographyId !== undefined ? { fallbackSourceOrthographyId } : {}),
      });
      await input.saveTextTranslationForUtterance(targetUtterance.id, transformedText, targetLayerId!);
    }));
  }, [
    input.layers,
    input.nextUtteranceIdForVoiceDictation,
    input.saveSegmentContentForLayer,
    input.saveTextTranslationForUtterance,
    input.saveUtteranceText,
    input.selectUtterance,
    input.selectedLayerId,
    input.selectedTimelineOwnerUtterance,
    input.selectedTimelineUnit,
    input.setSaveState,
    input.translationLayers,
  ]);

  const handleVoiceAnalysisResult = useCallback(async (utteranceId: string | null, analysisText: string) => {
    if (!utteranceId) {
      const message = '请先选择要分析的句段';
      reportValidationError({
        message,
        i18nKey: 'transcription.error.validation.voiceAnalysisUtteranceRequired',
        setErrorState: ({ message: nextMessage, meta }) => setSaveState({ kind: 'error', message: nextMessage, errorMeta: meta }),
      });
      return { ok: false, message };
    }

    const trimmed = analysisText.trim();
    if (!trimmed) {
      const message = '分析结果为空，未写回句段备注';
      return { ok: false, message };
    }
    try {
      const db = await getDb();
      const utterances = await db.collections.utterances.find().exec();
      const target = utterances.find((item) => item.id === utteranceId);
      if (!target) {
        const message = '未找到目标句段';
        reportValidationError({
          message,
          i18nKey: 'transcription.error.validation.voiceAnalysisTargetMissing',
          setErrorState: ({ message: nextMessage, meta }) => setSaveState({ kind: 'error', message: nextMessage, errorMeta: meta }),
        });
        return { ok: false, message };
      }
      pushUndo('AI 分析填充');
      const now = new Date().toISOString();
      const doc = target.toJSON() as UtteranceDocType;
      const existingNotes = doc.notes ?? {};
      const updated: UtteranceDocType = {
        ...doc,
        notes: { ...existingNotes, eng: trimmed },
        updatedAt: now,
      };
      await db.collections.utterances.insert(updated);
      setUtterances((prev) => prev.map((item) => (item.id === utteranceId ? updated : item)));
      const message = 'AI 分析结果已保存到句段备注';
      setSaveState({ kind: 'done', message });
      return { ok: true, message };
    } catch (error) {
      reportActionError({
        actionLabel: '保存分析结果',
        error,
        i18nKey: 'transcription.error.action.voiceAnalysisSaveFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return {
        ok: false,
        message: error instanceof Error ? error.message : '保存分析结果失败',
      };
    }
  }, [pushUndo, setSaveState, setUtterances]);
  return {
    aiPanelContextValue,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    handleVoiceAnalysisResult,
  };
}