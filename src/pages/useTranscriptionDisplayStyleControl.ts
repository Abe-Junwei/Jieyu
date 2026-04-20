import { useCallback, useEffect, useMemo } from 'react';
import type { LayerDisplaySettings, LayerDocType } from '../db';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import { fireAndForget } from '../utils/fireAndForget';
import { useLocalFonts } from '../hooks/useLocalFonts';
import { useOrthographies } from '../hooks/useOrthographies';
import { BASE_FONT_SIZE, buildOrthographyPreviewTextProps, computeLaneHeightFromRenderPolicy, resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import { DEFAULT_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from '../utils/translationLayerTargetResolver';

const SYSTEM_DEFAULT_FONT_KEY = '\u7cfb\u7edf\u9ed8\u8ba4';

interface UseTranscriptionDisplayStyleControlInput {
  layers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerById: Map<string, LayerDocType>;
  defaultTranscriptionLayerId?: string;
  selectedLayerId?: string;
  selectedTimelineUnitLayerId?: string;
  setLayers: React.Dispatch<React.SetStateAction<LayerDocType[]>>;
  handleTimelineLaneHeightChange: (layerId: string, nextHeight: number) => void;
}

export function useTranscriptionDisplayStyleControl({
  layers,
  transcriptionLayers,
  translationLayers,
  layerById,
  defaultTranscriptionLayerId,
  selectedLayerId,
  selectedTimelineUnitLayerId,
  setLayers,
  handleTimelineLaneHeightChange,
}: UseTranscriptionDisplayStyleControlInput) {
  const localFonts = useLocalFonts();
  const orthographyLanguageIds = useMemo(
    () => Array.from(new Set(layers.map((layer) => layer.languageId).filter((languageId): languageId is string => Boolean(languageId)))),
    [layers],
  );
  const orthographies = useOrthographies(orthographyLanguageIds);

  const handleUpdateLayerDisplaySettings = useCallback((layerId: string, patch: Partial<LayerDisplaySettings>) => {
    const layer = layers.find((candidateLayer) => candidateLayer.id === layerId);
    if (!layer) return;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
    const merged: LayerDisplaySettings = { ...layer.displaySettings, ...patch };
    if (merged.fontSize === BASE_FONT_SIZE) delete merged.fontSize;
    if (!merged.bold) delete merged.bold;
    if (!merged.italic) delete merged.italic;
    if (!merged.color) delete merged.color;
    if (!merged.fontFamily || merged.fontFamily === renderPolicy.defaultFontKey) delete merged.fontFamily;
    const { displaySettings: _prev, ...layerWithout } = layer;
    const updatedLayer = {
      ...layerWithout,
      ...(Object.keys(merged).length > 0 ? { displaySettings: merged } : {}),
      updatedAt: new Date().toISOString(),
    } as typeof layer;
    setLayers((prev) => prev.map((candidateLayer) => (candidateLayer.id === layerId ? updatedLayer : candidateLayer)));
    fireAndForget(LayerTierUnifiedService.updateLayer(updatedLayer));
    if (patch.fontSize != null) {
      const nextHeight = computeLaneHeightFromRenderPolicy(patch.fontSize, renderPolicy);
      handleTimelineLaneHeightChange(layerId, nextHeight);
    }
  }, [handleTimelineLaneHeightChange, layers, orthographies, setLayers]);

  const handleResetLayerDisplaySettings = useCallback((layerId: string) => {
    const layer = layers.find((candidateLayer) => candidateLayer.id === layerId);
    if (!layer) return;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
    const { displaySettings: _removed, ...rest } = layer;
    const updatedLayer = { ...rest, updatedAt: new Date().toISOString() } as typeof layer;
    setLayers((prev) => prev.map((candidateLayer) => (candidateLayer.id === layerId ? updatedLayer : candidateLayer)));
    fireAndForget(LayerTierUnifiedService.updateLayer(updatedLayer));
    handleTimelineLaneHeightChange(layerId, computeLaneHeightFromRenderPolicy(BASE_FONT_SIZE, renderPolicy, () => DEFAULT_TIMELINE_LANE_HEIGHT));
  }, [handleTimelineLaneHeightChange, layers, orthographies, setLayers]);

  const displayStyleControl = useMemo(() => ({
    orthographies,
    onUpdate: handleUpdateLayerDisplaySettings,
    onReset: handleResetLayerDisplaySettings,
    localFonts: {
      fonts: localFonts.fonts,
      status: localFonts.status,
      load: localFonts.loadLocalFonts,
      showAllFonts: localFonts.showAllFonts,
      toggleShowAllFonts: localFonts.toggleShowAllFonts,
      getSearchQuery: localFonts.getSearchQuery,
      setSearchQuery: localFonts.setSearchQuery,
      getCoverage: localFonts.getCoverage,
      ensureCoverage: localFonts.ensureCoverage,
    },
  }), [handleResetLayerDisplaySettings, handleUpdateLayerDisplaySettings, localFonts.ensureCoverage, localFonts.fonts, localFonts.getCoverage, localFonts.getSearchQuery, localFonts.loadLocalFonts, localFonts.setSearchQuery, localFonts.showAllFonts, localFonts.status, localFonts.toggleShowAllFonts, orthographies]);

  const waveformHoverPreviewProps = useMemo(() => {
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
  }, [defaultTranscriptionLayerId, layerById, orthographies]);

  const batchPreviewTextPropsByLayerId = useMemo(() => {
    const next: Record<string, ReturnType<typeof buildOrthographyPreviewTextProps>> = {};
    for (const layer of transcriptionLayers) {
      if (!layer.languageId) continue;
      const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
      next[layer.id] = buildOrthographyPreviewTextProps(renderPolicy, layer.displaySettings);
    }
    return next;
  }, [orthographies, transcriptionLayers]);

  const voiceDictationPreviewTextProps = useMemo(() => {
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
  }, [
    defaultTranscriptionLayerId,
    layerById,
    orthographies,
    selectedLayerId,
    selectedTimelineUnitLayerId,
    translationLayers,
  ]);

  useEffect(() => {
    const seen = new Set<string>();
    for (const layer of layers) {
      const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
      const fontCandidates = new Set<string>([
        renderPolicy.defaultFontKey,
        ...renderPolicy.preferredFontKeys,
        ...renderPolicy.fallbackFontKeys,
        ...(layer.displaySettings?.fontFamily ? [layer.displaySettings.fontFamily] : []),
      ]);
      for (const fontFamily of fontCandidates) {
        if (!fontFamily || fontFamily === SYSTEM_DEFAULT_FONT_KEY) continue;
        const verifyKey = `${fontFamily}\u0000${renderPolicy.scriptTag}\u0000${renderPolicy.coverageSummary.exemplarSample}\u0000${renderPolicy.coverageSummary.exemplarCharacterCount}`;
        if (seen.has(verifyKey)) continue;
        seen.add(verifyKey);
        void localFonts.ensureCoverage(fontFamily, renderPolicy);
      }
    }
  }, [layers, localFonts.ensureCoverage, orthographies]);

  return {
    displayStyleControl,
    waveformHoverPreviewProps,
    batchPreviewTextPropsByLayerId,
    voiceDictationPreviewTextProps,
  };
}
