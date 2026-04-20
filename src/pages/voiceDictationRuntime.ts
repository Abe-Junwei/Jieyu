import type { LayerDocType, LayerUnitDocType } from '../db';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';
import { loadOrthographyRuntime } from '../utils/loadOrthographyRuntime';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from '../utils/translationLayerTargetResolver';

interface ResolveVoiceDictationTargetInput {
  selectedLayerId: string | null;
  selectedUnitLayerId?: string | null;
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

interface PersistVoiceDictationToUnitInput extends TransformVoiceDictationTextInput {
  unitId: string;
  targetLayer: LayerDocType;
  saveUnitText: (unitId: string, text: string, layerId?: string) => Promise<void>;
  saveUnitLayerText: (unitId: string, text: string, layerId: string) => Promise<void>;
}

interface CreateVoiceDictationPipelineInput extends ResolveVoiceDictationTargetInput {
  selectedTimelineOwnerUnit: LayerUnitDocType | null;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  selectUnit: (unitId: string) => void;
  saveUnitText: (unitId: string, text: string, layerId?: string) => Promise<void>;
  saveUnitLayerText: (unitId: string, text: string, layerId: string) => Promise<void>;
}

export function resolveVoiceDictationTarget(input: ResolveVoiceDictationTargetInput) {
  const normalizedSelectedLayerId = input.selectedLayerId?.trim();
  if (normalizedSelectedLayerId) {
    const selectedLayer = input.layers.find((layer) => layer.id === normalizedSelectedLayerId) ?? null;
    if (selectedLayer) {
      return { targetLayerId: selectedLayer.id, targetLayer: selectedLayer };
    }
  }

  const normalizedDefaultTranscriptionLayerId = input.defaultTranscriptionLayerId?.trim();
  if (normalizedDefaultTranscriptionLayerId) {
    const defaultLayer = input.layers.find((layer) => layer.id === normalizedDefaultTranscriptionLayerId) ?? null;
    if (defaultLayer) {
      return { targetLayerId: defaultLayer.id, targetLayer: defaultLayer };
    }
  }

  const fallbackTranslationLayerId = resolveHostAwareTranslationLayerIdFromSnapshot({
    selectedLayerId: input.selectedLayerId,
    selectedUnitLayerId: input.selectedUnitLayerId,
    defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,
    translationLayers: input.translationLayers,
  });
  if (!fallbackTranslationLayerId) return null;
  const fallbackTranslationLayer = input.layers.find((layer) => layer.id === fallbackTranslationLayerId) ?? null;
  if (!fallbackTranslationLayer) return null;
  return { targetLayerId: fallbackTranslationLayer.id, targetLayer: fallbackTranslationLayer };
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

export async function persistVoiceDictationToUnit(input: PersistVoiceDictationToUnitInput) {
  const transformedText = await bridgeVoiceDictationText(input);
  if (input.targetLayer.layerType === 'transcription') {
    await input.saveUnitText(input.unitId, transformedText, input.targetLayerId);
    return transformedText;
  }
  await input.saveUnitLayerText(input.unitId, transformedText, input.targetLayerId);
  return transformedText;
}

export function createVoiceDictationPipeline(input: CreateVoiceDictationPipelineInput): {
  callbacks: DictationPipelineCallbacks;
  config?: QuickDictationConfig;
} | undefined {
  const resolvedTarget = resolveVoiceDictationTarget(input);
  if (!resolvedTarget || input.unitsOnCurrentMedia.length === 0) return undefined;
  const { targetLayerId, targetLayer } = resolvedTarget;
  const targetPipelineLayer = targetLayer.layerType === 'translation' ? 'translation' : 'transcription';

  return {
    callbacks: {
      getSegments: () => input.unitsOnCurrentMedia.map((unit, index) => {
        const currentText = input.getUnitTextForLayer(unit, targetLayerId).trim();
        return {
          segmentId: unit.id,
          index,
          startTime: unit.startTime,
          endTime: unit.endTime,
          existingText: targetPipelineLayer === 'transcription' ? (currentText || null) : null,
          existingTranslation: targetPipelineLayer === 'translation' ? (currentText || null) : null,
          existingGloss: null,
          skipProcessing: unit.tags?.skipProcessing === true,
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
          await input.saveUnitText(segmentId, text, targetLayerId);
          return;
        }
        await input.saveUnitLayerText(segmentId, text, targetLayerId);
      },
      restoreSegment: async (segmentId, _layer, previousText) => {
        if (targetPipelineLayer === 'transcription') {
          await input.saveUnitText(segmentId, previousText ?? '', targetLayerId);
          return;
        }
        await input.saveUnitLayerText(segmentId, previousText ?? '', targetLayerId);
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
