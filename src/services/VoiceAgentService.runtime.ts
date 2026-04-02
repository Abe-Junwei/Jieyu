/**
 * VoiceAgentService.runtime — 运行时配置辅助
 * Runtime helpers for VoiceAgentService lazy-loaded dependencies.
 */

import type { CommercialProviderKind, SttEngine } from './VoiceInputService';
import type { CommercialProviderCreateConfig } from './stt';
import type { Region } from '../utils/regionDetection';

export interface BuildVoiceAgentStartConfigParams {
  lang: string;
  runtimeEngine: SttEngine;
  region: Region;
  whisperServerUrl: string;
  whisperServerModel: string;
  commercialProviderKind: CommercialProviderKind;
  commercialProviderConfig: CommercialProviderCreateConfig;
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

  if (params.runtimeEngine === 'commercial' && params.commercialProviderConfig) {
    const { createCommercialProvider } = await params.loadSttRuntime();
    startConfig.commercialFallback = createCommercialProvider(
      params.commercialProviderKind,
      params.commercialProviderConfig,
    );
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
