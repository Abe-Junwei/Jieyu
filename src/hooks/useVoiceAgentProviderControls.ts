import { useCallback, useState } from 'react';
import type { CommercialProviderKind, SttEngine } from '../services/VoiceInputService';
import type {
  CommercialProviderCreateConfig,
  ProviderReachability,
  SttEnhancementConfig,
  SttEnhancementReachability,
  SttEnhancementSelectionKind,
} from '../services/stt';
import type { VoicePreset } from '../utils/voicePresets';

interface UseVoiceAgentProviderControlsInput {
  loadSttRuntime: () => Promise<typeof import('../services/stt')>;
  engineState: SttEngine;
  whisperServerUrl: string;
  whisperServerModel: string;
  commercialProviderKindState: CommercialProviderKind;
  commercialProviderConfigState?: CommercialProviderCreateConfig;
  sttEnhancementKindState: SttEnhancementSelectionKind;
  sttEnhancementConfigState?: SttEnhancementConfig;
  commercialProviderKindRef: { current: CommercialProviderKind };
  commercialProviderConfigRef: { current: CommercialProviderCreateConfig | undefined };
  switchEngine: (engine: import('../services/VoiceInputService').SttEngine) => void;
  setCommercialProviderKind: (kind: CommercialProviderKind) => void;
}

export function useVoiceAgentProviderControls(input: UseVoiceAgentProviderControlsInput) {
  const [providerStatusMap, setProviderStatusMap] = useState<ProviderReachability[]>([]);
  const [enhancementStatus, setEnhancementStatus] = useState<SttEnhancementReachability | null>(null);

  const refreshProviderStatus = useCallback(async () => {
    const { probeAllSttProviders, probeSelectedSttEnhancement } = await input.loadSttRuntime();
    const configs: Partial<Record<CommercialProviderKind, CommercialProviderCreateConfig>> = {};
    if (input.commercialProviderConfigRef.current) {
      configs[input.commercialProviderKindRef.current] = input.commercialProviderConfigRef.current;
    }
    const [results, nextEnhancementStatus] = await Promise.all([
      probeAllSttProviders({
        whisperLocalConfig: {
          baseUrl: input.whisperServerUrl,
          model: input.whisperServerModel,
        },
        commercialConfigs: configs,
      }),
      probeSelectedSttEnhancement(
        input.sttEnhancementKindState,
        input.sttEnhancementConfigState ?? {},
      ),
    ]);
    setProviderStatusMap(results);
    setEnhancementStatus(nextEnhancementStatus);
  }, [input]);

  const testCommercialProvider = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    const { testSttProvider } = await input.loadSttRuntime();
    if (input.engineState === 'whisper-local') {
      return testSttProvider('whisper-local', {
        baseUrl: input.whisperServerUrl,
        model: input.whisperServerModel,
      });
    }
    if (input.engineState === 'commercial') {
      return testSttProvider(input.commercialProviderKindState, input.commercialProviderConfigState ?? {});
    }
    return testSttProvider('web-speech', {});
  }, [input]);

  const selectPreset = useCallback((preset: VoicePreset) => {
    input.switchEngine(preset.engine);
    if (preset.commercialKind) {
      input.setCommercialProviderKind(preset.commercialKind);
    }
  }, [input]);

  return {
    providerStatusMap,
    enhancementStatus,
    refreshProviderStatus,
    selectPreset,
    testCommercialProvider,
  };
}
