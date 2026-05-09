/**
 * transcriptionDisplayStyleHelpers — Pure helpers for preview text props computation
 * Extracted from useTranscriptionDisplayStyleControl.ts
 */

import type { LayerDocType, LayerLinkDocType, OrthographyDocType } from '../types/jieyuDbDocTypes';
import {
  buildOrthographyPreviewTextProps,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from '../utils/translationLayerTargetResolver';

export function buildWaveformHoverPreviewTextProps(
  defaultTranscriptionLayerId: string | undefined,
  layerById: Map<string, LayerDocType>,
  orthographies: OrthographyDocType[] | undefined,
) {
  if (!defaultTranscriptionLayerId) {
    return buildOrthographyPreviewTextProps();
  }
  const defaultTranscriptionLayer = layerById.get(defaultTranscriptionLayerId);
  if (!defaultTranscriptionLayer?.languageId) {
    return buildOrthographyPreviewTextProps();
  }
  const renderPolicy = resolveOrthographyRenderPolicy(
    defaultTranscriptionLayer.languageId,
    orthographies,
    defaultTranscriptionLayer.orthographyId,
  );
  return buildOrthographyPreviewTextProps(renderPolicy, defaultTranscriptionLayer.displaySettings);
}

export function buildBatchPreviewTextPropsByLayerId(
  transcriptionLayers: LayerDocType[],
  orthographies: OrthographyDocType[] | undefined,
) {
  const next: Record<string, ReturnType<typeof buildOrthographyPreviewTextProps>> = {};
  for (const layer of transcriptionLayers) {
    if (!layer.languageId) continue;
    const renderPolicy = resolveOrthographyRenderPolicy(
      layer.languageId,
      orthographies,
      layer.orthographyId,
    );
    next[layer.id] = buildOrthographyPreviewTextProps(renderPolicy, layer.displaySettings);
  }
  return next;
}

export function buildVoiceDictationPreviewTextProps(
  selectedLayerId: string | undefined,
  selectedTimelineUnitLayerId: string | undefined,
  defaultTranscriptionLayerId: string | undefined,
  transcriptionLayers: LayerDocType[],
  translationLayers: LayerDocType[],
  layerLinks: LayerLinkDocType[],
  layerById: Map<string, LayerDocType>,
  orthographies: OrthographyDocType[] | undefined,
) {
  const normalizedSelectedLayerId = selectedLayerId?.trim();
  const selectedLayer = normalizedSelectedLayerId
    ? layerById.get(normalizedSelectedLayerId)
    : undefined;
  const defaultLayer = defaultTranscriptionLayerId?.trim()
    ? layerById.get(defaultTranscriptionLayerId.trim())
    : undefined;
  const fallbackTranslationLayerId = resolveHostAwareTranslationLayerIdFromSnapshot({
    selectedLayerId,
    selectedUnitLayerId: selectedTimelineUnitLayerId,
    defaultTranscriptionLayerId,
    translationLayers,
    transcriptionLayers,
    layerLinks,
  });
  const fallbackTranslationLayer = fallbackTranslationLayerId
    ? layerById.get(fallbackTranslationLayerId)
    : undefined;
  const targetLayer = selectedLayer ?? defaultLayer ?? fallbackTranslationLayer;
  if (!targetLayer) {
    return buildOrthographyPreviewTextProps();
  }
  if (!targetLayer.languageId) {
    return buildOrthographyPreviewTextProps();
  }
  const renderPolicy = resolveOrthographyRenderPolicy(
    targetLayer.languageId,
    orthographies,
    targetLayer.orthographyId,
  );
  return buildOrthographyPreviewTextProps(renderPolicy, targetLayer.displaySettings);
}
