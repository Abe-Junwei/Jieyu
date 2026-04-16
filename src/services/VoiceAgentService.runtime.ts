/**
 * VoiceAgentService.runtime — 运行时配置辅助
 * Runtime helpers for VoiceAgentService lazy-loaded dependencies.
 */

import type { CommercialProviderKind, SttEngine } from './VoiceInputService';
import type { CommercialProviderCreateConfig, SttEnhancementConfig, SttEnhancementSelectionKind } from './stt';
import type { Region } from '../utils/regionDetection';

export interface BuildVoiceAgentStartConfigParams {
  lang: string;
  runtimeEngine: SttEngine;
  region: Region;
  whisperServerUrl: string;
  whisperServerModel: string;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
  sttEnhancementKind: SttEnhancementSelectionKind;
  sttEnhancementConfig: SttEnhancementConfig;
  loadSttRuntime: () => Promise<typeof import('./stt')>;
}

export async function buildVoiceAgentStartConfig(
  params: BuildVoiceAgentStartConfigParams,
): Promise<{
  lang: string;
  continuous: true;
  interimResults: true;
  preferredEngine: SttEngine;
  region: Region;
  maxAlternatives: 3;
  whisperServerUrl?: string;
  whisperServerModel?: string;
  commercialFallback?: Awaited<ReturnType<Awaited<ReturnType<BuildVoiceAgentStartConfigParams['loadSttRuntime']>>['createCommercialProvider']>>;
  sttEnhancement?: Awaited<ReturnType<Awaited<ReturnType<BuildVoiceAgentStartConfigParams['loadSttRuntime']>>['createSttEnhancementProvider']>>;
  sttEnhancementConfig?: SttEnhancementConfig;
}> {
  const startConfig: {
    lang: string;
    continuous: true;
    interimResults: true;
    preferredEngine: SttEngine;
    region: Region;
    maxAlternatives: 3;
    whisperServerUrl?: string;
    whisperServerModel?: string;
    commercialFallback?: Awaited<ReturnType<Awaited<ReturnType<BuildVoiceAgentStartConfigParams['loadSttRuntime']>>['createCommercialProvider']>>;
    sttEnhancement?: Awaited<ReturnType<Awaited<ReturnType<BuildVoiceAgentStartConfigParams['loadSttRuntime']>>['createSttEnhancementProvider']>>;
    sttEnhancementConfig?: SttEnhancementConfig;
  } = {
    lang: params.lang,
    continuous: true,
    interimResults: true,
    preferredEngine: params.runtimeEngine,
    region: params.region,
    maxAlternatives: 3,
  };

  if (params.runtimeEngine === 'whisper-local') {
    startConfig.whisperServerUrl = params.whisperServerUrl;
    startConfig.whisperServerModel = params.whisperServerModel;
  }

  if ((params.runtimeEngine === 'commercial' && params.commercialProviderConfig) || params.sttEnhancementKind !== 'none') {
    const { createCommercialProvider, createSttEnhancementProvider } = await params.loadSttRuntime();
    if (params.runtimeEngine === 'commercial' && params.commercialProviderConfig) {
      startConfig.commercialFallback = createCommercialProvider(
        params.commercialProviderKind,
        params.commercialProviderConfig,
      );
    }
    if (params.sttEnhancementKind !== 'none') {
      startConfig.sttEnhancement = createSttEnhancementProvider(params.sttEnhancementKind);
      startConfig.sttEnhancementConfig = params.sttEnhancementConfig;
    }
  }

  return startConfig;
}

export async function testVoiceAgentCommercialProvider(
  kind: CommercialProviderKind,
  config: CommercialProviderCreateConfig,
  loadSttRuntime: () => Promise<typeof import('./stt')>,
): Promise<{ available: boolean; error?: string }> {
  const { testCommercialProvider } = await loadSttRuntime();
  return testCommercialProvider(kind, config);
}
