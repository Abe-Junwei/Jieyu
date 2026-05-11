import { useCallback, useEffect, useMemo } from 'react';
import type {
  LayerDisplaySettings,
  LayerDocType,
  LayerLinkDocType,
} from '../types/jieyuDbDocTypes';
import { LayerTierUnifiedService } from '../app/transcriptionServicesPageAccess';
import { fireAndForget } from '../utils/fireAndForget';
import { useLocalFonts } from '~/hooks/fonts/useLocalFonts';
import { useOrthographies } from '~/hooks/orthography/useOrthographies';
import {
  BASE_FONT_SIZE,
  computeLaneHeightFromRenderPolicy,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import { DEFAULT_TIMELINE_LANE_HEIGHT } from '../hooks/transcription/useTimelineLaneHeightResize';
import {
  buildBatchPreviewTextPropsByLayerId,
  buildVoiceDictationPreviewTextProps,
  buildWaveformHoverPreviewTextProps,
} from './transcriptionDisplayStyleHelpers';

const SYSTEM_DEFAULT_FONT_KEY = '\u7cfb\u7edf\u9ed8\u8ba4';

interface UseTranscriptionDisplayStyleControlInput {
  layers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
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
  layerLinks,
  layerById,
  defaultTranscriptionLayerId,
  selectedLayerId,
  selectedTimelineUnitLayerId,
  setLayers,
  handleTimelineLaneHeightChange,
}: UseTranscriptionDisplayStyleControlInput) {
  const localFonts = useLocalFonts();
  const orthographyLanguageIds = useMemo(
    () =>
      Array.from(
        new Set(
          layers
            .map((layer) => layer.languageId)
            .filter((languageId): languageId is string => Boolean(languageId)),
        ),
      ),
    [layers],
  );
  const orthographies = useOrthographies(orthographyLanguageIds);

  const handleUpdateLayerDisplaySettings = useCallback(
    (layerId: string, patch: Partial<LayerDisplaySettings>) => {
      const layer = layers.find((candidateLayer) => candidateLayer.id === layerId);
      if (!layer) return;
      const renderPolicy = resolveOrthographyRenderPolicy(
        layer.languageId,
        orthographies,
        layer.orthographyId,
      );
      const merged: LayerDisplaySettings = { ...layer.displaySettings, ...patch };
      if (merged.fontSize === BASE_FONT_SIZE) delete merged.fontSize;
      if (!merged.bold) delete merged.bold;
      if (!merged.italic) delete merged.italic;
      if (!merged.color) delete merged.color;
      if (!merged.fontFamily || merged.fontFamily === renderPolicy.defaultFontKey)
        delete merged.fontFamily;
      const { displaySettings: _prev, ...layerWithout } = layer;
      const updatedLayer = {
        ...layerWithout,
        ...(Object.keys(merged).length > 0 ? { displaySettings: merged } : {}),
        updatedAt: new Date().toISOString(),
      } as typeof layer;
      setLayers((prev) =>
        prev.map((candidateLayer) =>
          candidateLayer.id === layerId ? updatedLayer : candidateLayer,
        ),
      );
      fireAndForget(LayerTierUnifiedService.updateLayer(updatedLayer), {
        context: 'src/pages/useTranscriptionDisplayStyleControl.ts:L62',
        policy: 'user-visible',
      });
      if (patch.fontSize != null) {
        const nextHeight = computeLaneHeightFromRenderPolicy(patch.fontSize, renderPolicy);
        handleTimelineLaneHeightChange(layerId, nextHeight);
      }
    },
    [handleTimelineLaneHeightChange, layers, orthographies, setLayers],
  );

  const handleResetLayerDisplaySettings = useCallback(
    (layerId: string) => {
      const layer = layers.find((candidateLayer) => candidateLayer.id === layerId);
      if (!layer) return;
      const renderPolicy = resolveOrthographyRenderPolicy(
        layer.languageId,
        orthographies,
        layer.orthographyId,
      );
      const { displaySettings: _removed, ...rest } = layer;
      const updatedLayer = { ...rest, updatedAt: new Date().toISOString() } as typeof layer;
      setLayers((prev) =>
        prev.map((candidateLayer) =>
          candidateLayer.id === layerId ? updatedLayer : candidateLayer,
        ),
      );
      fireAndForget(LayerTierUnifiedService.updateLayer(updatedLayer), {
        context: 'src/pages/useTranscriptionDisplayStyleControl.ts:L76',
        policy: 'user-visible',
      });
      handleTimelineLaneHeightChange(
        layerId,
        computeLaneHeightFromRenderPolicy(
          BASE_FONT_SIZE,
          renderPolicy,
          () => DEFAULT_TIMELINE_LANE_HEIGHT,
        ),
      );
    },
    [handleTimelineLaneHeightChange, layers, orthographies, setLayers],
  );

  const displayStyleControl = useMemo(
    () => ({
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
    }),
    [
      handleResetLayerDisplaySettings,
      handleUpdateLayerDisplaySettings,
      localFonts.ensureCoverage,
      localFonts.fonts,
      localFonts.getCoverage,
      localFonts.getSearchQuery,
      localFonts.loadLocalFonts,
      localFonts.setSearchQuery,
      localFonts.showAllFonts,
      localFonts.status,
      localFonts.toggleShowAllFonts,
      orthographies,
    ],
  );

  const waveformHoverPreviewProps = useMemo(
    () => buildWaveformHoverPreviewTextProps(defaultTranscriptionLayerId, layerById, orthographies),
    [defaultTranscriptionLayerId, layerById, orthographies],
  );

  const batchPreviewTextPropsByLayerId = useMemo(
    () => buildBatchPreviewTextPropsByLayerId(transcriptionLayers, orthographies),
    [orthographies, transcriptionLayers],
  );

  const voiceDictationPreviewTextProps = useMemo(
    () =>
      buildVoiceDictationPreviewTextProps(
        selectedLayerId,
        selectedTimelineUnitLayerId,
        defaultTranscriptionLayerId,
        transcriptionLayers,
        translationLayers,
        layerLinks,
        layerById,
        orthographies,
      ),
    [
      defaultTranscriptionLayerId,
      layerById,
      orthographies,
      selectedLayerId,
      selectedTimelineUnitLayerId,
      layerLinks,
      transcriptionLayers,
      translationLayers,
    ],
  );

  useEffect(() => {
    const seen = new Set<string>();
    for (const layer of layers) {
      const renderPolicy = resolveOrthographyRenderPolicy(
        layer.languageId,
        orthographies,
        layer.orthographyId,
      );
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
  }, [layers, localFonts, orthographies]);

  return {
    displayStyleControl,
    waveformHoverPreviewProps,
    batchPreviewTextPropsByLayerId,
    voiceDictationPreviewTextProps,
  };
}
