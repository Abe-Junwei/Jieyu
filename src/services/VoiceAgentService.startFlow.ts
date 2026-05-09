import type { VoiceInputService as VoiceInputServiceType } from './VoiceInputService';
import type { CommercialProviderKind, SttEngine } from './VoiceInputService.types';
import type {
  CommercialProviderCreateConfig,
  SttEnhancementConfig,
  SttEnhancementSelectionKind,
} from './stt';
import type { VoiceAgentMode, VoiceAgentServiceState } from './VoiceAgentService.types';
import { detectRegion } from '../utils/regionDetection';
import type { SpeechQualityAnalyzer } from './SpeechQualityAnalyzer';
import {
  resolveVoiceAgentEffectiveLang,
  scheduleVoiceAgentBatteryLevelRefresh,
} from './VoiceAgentService.langAndBattery';
import { buildVoiceAgentStartConfig } from './VoiceAgentService.runtime';
import { loadSttRuntime, loadSttStrategyRuntime } from './voiceRuntimeLoaders';

interface AbortExclusiveStartIfStaleParams {
  activateToken: number;
  isStartTokenCurrent: (token: number) => boolean;
  voiceService: VoiceInputServiceType;
  speechQuality: SpeechQualityAnalyzer | null;
  stopSpeechQuality?: boolean;
}

function abortExclusiveStartIfStale(params: AbortExclusiveStartIfStaleParams): boolean {
  if (params.isStartTokenCurrent(params.activateToken)) return false;
  try {
    params.voiceService.stop();
  } catch {
    /* ignore */
  }
  if (params.stopSpeechQuality) {
    params.speechQuality?.stop();
  }
  return true;
}

export interface RunVoiceAgentExclusiveStartParams {
  targetMode?: VoiceAgentMode;
  activateToken: number;
  ensureVoiceService: () => Promise<VoiceInputServiceType>;
  isStartTokenCurrent: (token: number) => boolean;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  resetSession: () => void;
  getLangOverride: () => string | null;
  getCorpusLang: () => string;
  getPreferredEngine: () => SttEngine;
  getEnergyLevel: () => number;
  getBatteryLevel: () => number | undefined;
  setBatteryLevel: (level: number) => void;
  whisperServerUrl: string;
  whisperServerModel: string;
  getCommercialProviderKind: () => CommercialProviderKind;
  getCommercialProviderConfig: () => CommercialProviderCreateConfig;
  getSttEnhancementKind: () => SttEnhancementSelectionKind;
  getSttEnhancementConfig: () => SttEnhancementConfig;
  getSpeechQuality: () => SpeechQualityAnalyzer | null;
  onStartFailed: (message: string) => void;
  onActivated: () => void;
}

export async function runVoiceAgentExclusiveStart(
  params: RunVoiceAgentExclusiveStartParams,
): Promise<void> {
  if (params.targetMode) params.setState({ mode: params.targetMode });
  params.setState({ error: null, pendingConfirm: null, agentState: 'listening' });
  params.resetSession();

  const voiceService = await params.ensureVoiceService();
  if (
    abortExclusiveStartIfStale({
      activateToken: params.activateToken,
      isStartTokenCurrent: params.isStartTokenCurrent,
      voiceService,
      speechQuality: params.getSpeechQuality(),
    })
  ) {
    return;
  }

  const lang = resolveVoiceAgentEffectiveLang({
    langOverride: params.getLangOverride(),
    corpusLang: params.getCorpusLang(),
  });

  scheduleVoiceAgentBatteryLevelRefresh((level) => {
    params.setBatteryLevel(level);
  });

  const region = await detectRegion();
  if (
    abortExclusiveStartIfStale({
      activateToken: params.activateToken,
      isStartTokenCurrent: params.isStartTokenCurrent,
      voiceService,
      speechQuality: params.getSpeechQuality(),
    })
  ) {
    return;
  }

  const { chooseSttEngine } = await loadSttStrategyRuntime();
  const batteryLevel = params.getBatteryLevel();
  const runtimeEngine = chooseSttEngine({
    preferred: params.getPreferredEngine(),
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    noiseLevel: params.getEnergyLevel(),
    ...(batteryLevel !== undefined ? { batteryLevel } : {}),
    regionHint: region,
  });

  const startConfig = await buildVoiceAgentStartConfig({
    lang,
    runtimeEngine,
    region,
    whisperServerUrl: params.whisperServerUrl,
    whisperServerModel: params.whisperServerModel,
    commercialProviderKind: params.getCommercialProviderKind(),
    commercialProviderConfig: params.getCommercialProviderConfig(),
    sttEnhancementKind: params.getSttEnhancementKind(),
    sttEnhancementConfig: params.getSttEnhancementConfig(),
    loadSttRuntime,
  });
  if (
    abortExclusiveStartIfStale({
      activateToken: params.activateToken,
      isStartTokenCurrent: params.isStartTokenCurrent,
      voiceService,
      speechQuality: params.getSpeechQuality(),
    })
  ) {
    return;
  }

  try {
    await voiceService.start(startConfig);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '语音服务启动失败 | Failed to start voice service';
    params.onStartFailed(message);
    return;
  }

  if (
    abortExclusiveStartIfStale({
      activateToken: params.activateToken,
      isStartTokenCurrent: params.isStartTokenCurrent,
      voiceService,
      speechQuality: params.getSpeechQuality(),
    })
  ) {
    return;
  }

  const speechQuality = params.getSpeechQuality();
  if (speechQuality && !speechQuality.isActive) {
    const stream = await voiceService.createAnalysisCloneStream();
    if (
      abortExclusiveStartIfStale({
        activateToken: params.activateToken,
        isStartTokenCurrent: params.isStartTokenCurrent,
        voiceService,
        speechQuality,
        stopSpeechQuality: true,
      })
    ) {
      return;
    }
    if (stream) {
      await speechQuality.start(stream);
    } else {
      void speechQuality.start();
    }
  }

  if (
    abortExclusiveStartIfStale({
      activateToken: params.activateToken,
      isStartTokenCurrent: params.isStartTokenCurrent,
      voiceService,
      speechQuality: params.getSpeechQuality(),
      stopSpeechQuality: true,
    })
  ) {
    return;
  }

  params.onActivated();
}
