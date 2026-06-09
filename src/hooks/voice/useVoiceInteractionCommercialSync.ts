import { useCallback, useEffect } from 'react';
import { applyVoiceCommercialConfigChange } from '../../utils/voiceCommercialConfigSync';
import type { CommercialProviderKind } from '../../services/VoiceInputService';
import type { useVoiceAgent } from './useVoiceAgent';

interface CommercialProviderConfigLike {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  appId?: string;
  accessToken?: string;
}

export interface UseVoiceInteractionCommercialSyncInput {
  voiceAgent: ReturnType<typeof useVoiceAgent>;
  onCommercialConfigChange: (config: CommercialProviderConfigLike) => void;
  setCommercialProviderKind: (kind: CommercialProviderKind) => void;
  setCommercialProviderConfig: (config: CommercialProviderConfigLike) => void;
}

export function useVoiceInteractionCommercialSync({
  voiceAgent,
  onCommercialConfigChange,
  setCommercialProviderKind,
  setCommercialProviderConfig,
}: UseVoiceInteractionCommercialSyncInput) {
  const handleVoiceCommercialConfigChange = useCallback(
    (config: CommercialProviderConfigLike) => {
      applyVoiceCommercialConfigChange(
        config,
        onCommercialConfigChange,
        voiceAgent.setCommercialProviderConfig,
      );
    },
    [onCommercialConfigChange, voiceAgent.setCommercialProviderConfig],
  );

  useEffect(() => {
    setCommercialProviderKind(voiceAgent.commercialProviderKind);
  }, [setCommercialProviderKind, voiceAgent.commercialProviderKind]);

  useEffect(() => {
    setCommercialProviderConfig(voiceAgent.commercialProviderConfig ?? {});
  }, [setCommercialProviderConfig, voiceAgent.commercialProviderConfig]);

  return { handleVoiceCommercialConfigChange };
}
