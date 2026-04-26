import { useCallback, useState } from 'react';
import type { CommercialProviderKind, SttEngine } from '../services/VoiceInputService';
import type { CommercialProviderCreateConfig, ProviderReachability, SttEnhancementConfig, SttEnhancementReachability, SttEnhancementSelectionKind } from '../services/stt';
import type { VoicePreset } from '../utils/voicePresets';

interface UseVoiceAgentProviderControlsInput {
  loadSttRuntime: () => Promise<typeof import('../services/stt')>;
  engineState: SttEngine;
  whisperServerUrl: string;
  whisperServerModel: string;
  commercialProviderKindState: CommercialProviderKind;
  commercialProviderConfigState?: CommercialProviderCreateConfig | undefined;
  sttEnhancementKindState: SttEnhancementSelectionKind;
  sttEnhancementConfigState?: SttEnhancementConfig | undefined;
  commercialProviderKindRef: { current: CommercialProviderKind };
  commercialProviderConfigRef: { current: CommercialProviderCreateConfig | undefined };
  switchEngine: (engine: import('../services/VoiceInputService').SttEngine) => void;
  setCommercialProviderKind: (kind: CommercialProviderKind) => void;
}

export function useVoiceAgentProviderControls(input: UseVoiceAgentProviderControlsInput) {
  const {
    loadSttRuntime,
    engineState,
    whisperServerUrl,
    whisperServerModel,
    commercialProviderKindState,
    commercialProviderConfigState,
    sttEnhancementKindState,
    sttEnhancementConfigState,
    commercialProviderKindRef,
    commercialProviderConfigRef,
    switchEngine,
    setCommercialProviderKind,
  } = input;

  const [providerStatusMap, setProviderStatusMap] = useState<ProviderReachability[]>([]);
  const [enhancementStatus, setEnhancementStatus] = useState<SttEnhancementReachability | null>(null);

  const refreshProviderStatus = useCallback(async () => {
    const { probeAllSttProviders, probeSelectedSttEnhancement } = await loadSttRuntime();
    const configs: Partial<Record<CommercialProviderKind, CommercialProviderCreateConfig>> = {};
    if (commercialProviderConfigRef.current) {
      configs[commercialProviderKindRef.current] = commercialProviderConfigRef.current;
    }
    const [results, nextEnhancementStatus] = await Promise.all([
      probeAllSttProviders({
        whisperLocalConfig: {
          baseUrl: whisperServerUrl,
          model: whisperServerModel,
        },
        commercialConfigs: configs,
      }),
      probeSelectedSttEnhancement(
        sttEnhancementKindState,
        sttEnhancementConfigState ?? {},
      ),
    ]);
    setProviderStatusMap(results);
    setEnhancementStatus(nextEnhancementStatus);
  }, [
    loadSttRuntime,
    whisperServerUrl,
    whisperServerModel,
    commercialProviderKindRef,
    commercialProviderConfigRef,
    sttEnhancementKindState,
    sttEnhancementConfigState,
  ]);

  const testCommercialProvider = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    const { testSttProvider } = await loadSttRuntime();
    if (engineState === 'whisper-local') {
      return testSttProvider('whisper-local', {
        baseUrl: whisperServerUrl,
        model: whisperServerModel,
      });
    }
    if (engineState === 'commercial') {
      return testSttProvider(commercialProviderKindState, commercialProviderConfigState ?? {});
    }
    return testSttProvider('web-speech', {});
  }, [
    loadSttRuntime,
    engineState,
    whisperServerUrl,
    whisperServerModel,
    commercialProviderKindState,
    commercialProviderConfigState,
  ]);

  const selectPreset = useCallback((preset: VoicePreset) => {
    switchEngine(preset.engine);
    if (preset.commercialKind) {
      setCommercialProviderKind(preset.commercialKind);
    }
  }, [setCommercialProviderKind, switchEngine]);

  return {
    providerStatusMap,
    enhancementStatus,
    refreshProviderStatus,
    selectPreset,
    testCommercialProvider,
  };
}
