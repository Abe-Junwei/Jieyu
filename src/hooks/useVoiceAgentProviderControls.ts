import { useCallback, useState } from 'react';
import type { CommercialProviderKind } from '../services/VoiceInputService';
import type { CommercialProviderCreateConfig, ProviderReachability } from '../services/stt';
import type { VoicePreset } from '../utils/voicePresets';

interface UseVoiceAgentProviderControlsInput {
  loadSttRuntime: () => Promise<typeof import('../services/stt')>;
  commercialProviderKindState: CommercialProviderKind;
  commercialProviderConfigState?: CommercialProviderCreateConfig;
  commercialProviderKindRef: { current: CommercialProviderKind };
  commercialProviderConfigRef: { current: CommercialProviderCreateConfig | undefined };
  switchEngine: (engine: import('../services/VoiceInputService').SttEngine) => void;
  setCommercialProviderKind: (kind: CommercialProviderKind) => void;
}

export function useVoiceAgentProviderControls(input: UseVoiceAgentProviderControlsInput) {
  const [providerStatusMap, setProviderStatusMap] = useState<ProviderReachability[]>([]);

  const refreshProviderStatus = useCallback(async () => {
    const { probeAllCommercialProviders } = await input.loadSttRuntime();
    const configs: Partial<Record<CommercialProviderKind, CommercialProviderCreateConfig>> = {};
    if (input.commercialProviderConfigRef.current) {
      configs[input.commercialProviderKindRef.current] = input.commercialProviderConfigRef.current;
    }
    const results = await probeAllCommercialProviders(configs);
    setProviderStatusMap(results);
  }, [input]);

  const testCommercialProvider = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    const { testCommercialProvider } = await input.loadSttRuntime();
    return testCommercialProvider(input.commercialProviderKindState, input.commercialProviderConfigState ?? {});
  }, [input]);

  const selectPreset = useCallback((preset: VoicePreset) => {
    input.switchEngine(preset.engine);
    if (preset.commercialKind) {
      input.setCommercialProviderKind(preset.commercialKind);
    }
  }, [input]);

  return {
    providerStatusMap,
    refreshProviderStatus,
    selectPreset,
    testCommercialProvider,
  };
}
