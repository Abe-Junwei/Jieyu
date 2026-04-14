import type { LayerDocType, UtteranceDocType } from '../db';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import { loadOrthographyRuntime } from '../utils/loadOrthographyRuntime';

interface ResolveVoiceDictationTargetInput {
  selectedLayerId: string | null;
  defaultTranscriptionLayerId?: string;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
}

interface TransformVoiceDictationTextInput {
  text: string;
  targetLayerId: string;
  selectedLayerId: string | null;
  layers: LayerDocType[];
}

interface PersistVoiceDictationToUtteranceInput extends TransformVoiceDictationTextInput {
  utteranceId: string;
  targetLayer: LayerDocType;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
}

interface CreateVoiceDictationPipelineInput extends ResolveVoiceDictationTargetInput {
  selectedTimelineOwnerUnit: UtteranceDocType | null;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  selectUnit: (utteranceId: string) => void;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
}

export function resolveVoiceDictationTarget(input: ResolveVoiceDictationTargetInput) {
  const normalizedSelectedLayerId = input.selectedLayerId?.trim();
  const targetLayerId = normalizedSelectedLayerId || input.defaultTranscriptionLayerId || input.translationLayers[0]?.id;
  if (!targetLayerId) return null;
  const targetLayer = input.layers.find((layer) => layer.id === targetLayerId) ?? null;
  if (!targetLayer) return null;
  return { targetLayerId, targetLayer };
}

export async function bridgeVoiceDictationText(input: TransformVoiceDictationTextInput) {
  const {
    bridgeTextForLayerTarget,
    resolveFallbackSourceOrthographyId,
  } = await loadOrthographyRuntime();
  const fallbackSourceOrthographyId = resolveFallbackSourceOrthographyId({
    layers: input.layers,
    selectedLayerId: input.selectedLayerId,
  });
  return bridgeTextForLayerTarget({
    text: input.text,
    layers: input.layers,
    targetLayerId: input.targetLayerId,
    selectedLayerId: input.selectedLayerId,
    ...(fallbackSourceOrthographyId !== undefined ? { fallbackSourceOrthographyId } : {}),
  });
}

export async function persistVoiceDictationToUtterance(input: PersistVoiceDictationToUtteranceInput) {
  const transformedText = await bridgeVoiceDictationText(input);
  if (input.targetLayer.layerType === 'transcription') {
    await input.saveUtteranceText(input.utteranceId, transformedText, input.targetLayerId);
    return transformedText;
  }
  await input.saveTextTranslationForUtterance(input.utteranceId, transformedText, input.targetLayerId);
  return transformedText;
}

export function createVoiceDictationPipeline(input: CreateVoiceDictationPipelineInput): {
  callbacks: DictationPipelineCallbacks;
  config?: QuickDictationConfig;
} | undefined {
  const resolvedTarget = resolveVoiceDictationTarget(input);
  if (!resolvedTarget || input.utterancesOnCurrentMedia.length === 0) return undefined;
  const { targetLayerId, targetLayer } = resolvedTarget;
  const targetPipelineLayer = targetLayer.layerType === 'translation' ? 'translation' : 'transcription';

  return {
    callbacks: {
      getSegments: () => input.utterancesOnCurrentMedia.map((utterance, index) => {
        const currentText = input.getUtteranceTextForLayer(utterance, targetLayerId).trim();
        return {
          segmentId: utterance.id,
          index,
          startTime: utterance.startTime,
          endTime: utterance.endTime,
          existingText: targetPipelineLayer === 'transcription' ? (currentText || null) : null,
          existingTranslation: targetPipelineLayer === 'translation' ? (currentText || null) : null,
          existingGloss: null,
        };
      }),
      getCurrentSegmentId: () => input.selectedTimelineOwnerUnit?.id ?? null,
      transformTextForFill: ({ text }) => bridgeVoiceDictationText({
        text,
        targetLayerId,
        selectedLayerId: input.selectedLayerId,
        layers: input.layers,
      }),
      fillSegment: async (segmentId, _layer, text) => {
        if (targetPipelineLayer === 'transcription') {
          await input.saveUtteranceText(segmentId, text, targetLayerId);
          return;
        }
        await input.saveTextTranslationForUtterance(segmentId, text, targetLayerId);
      },
      restoreSegment: async (segmentId, _layer, previousText) => {
        if (targetPipelineLayer === 'transcription') {
          await input.saveUtteranceText(segmentId, previousText ?? '', targetLayerId);
          return;
        }
        await input.saveTextTranslationForUtterance(segmentId, previousText ?? '', targetLayerId);
      },
      navigateTo: (segmentId) => input.selectUnit(segmentId),
      navigateToNextUnannotated: () => null,
    },
    config: {
      targetLayer: targetPipelineLayer,
      autoAdvance: true,
      silenceConfirmDelayMs: 600,
      skipAlreadyAnnotated: true,
    },
  };
}
