import { useCallback } from 'react';
import * as Earcon from '../services/EarconService';
import { unlockAudio } from '../services/EarconService';
import { createLogger } from '../observability/logger';
import { detectRegion } from '../utils/regionDetection';
import { toBcp47 } from '../utils/langMapping';
import type { SttEngine, VoiceInputService as VoiceInputServiceType } from '../services/VoiceInputService';
import type { CommercialProviderCreateConfig, SttEnhancementConfig, SttEnhancementSelectionKind } from '../services/stt';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { bindVoiceInputService } from './useVoiceAgent.serviceBindings';
import { createVoiceSessionState } from './useVoiceAgent.runtime';

const log = createLogger('useVoiceAgentStartController');

interface RefLike<T> {
  current: T;
}

/** After `stop()` bumps the generation ref, in-flight mic start tails call `stop`, reset UI, and return. */
function abortStaleMicStart(
  gen: number,
  generationRef: RefLike<number>,
  serviceRef: RefLike<VoiceInputServiceType | null>,
  resetUi: () => void,
): boolean {
  if (gen === generationRef.current) return false;
  try {
    serviceRef.current?.stop();
  } catch {
    /* ignore */
  }
  resetUi();
  return true;
}

type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

interface UseVoiceAgentStartControllerOptions {
  locale: Locale;
  listening: boolean;
  corpusLang: string;
  whisperServerUrl: string;
  whisperServerModel: string;
  dictationPipeline: { callbacks: unknown; config?: unknown } | undefined;
  modeRef: RefLike<VoiceAgentMode>;
  engineRef: RefLike<SttEngine>;
  langOverrideRef: RefLike<string | null | undefined>;
  commercialProviderKindRef: RefLike<'gemini' | 'openai-audio' | 'groq' | 'custom-http' | 'minimax' | 'volcengine'>;
  commercialProviderConfigRef: RefLike<CommercialProviderCreateConfig | undefined>;
  sttEnhancementKindRef: RefLike<SttEnhancementSelectionKind>;
  sttEnhancementConfigRef: RefLike<SttEnhancementConfig | undefined>;
  aliasMapRef: RefLike<Record<string, string>>;
  energyLevelRef: RefLike<number>;
  pendingAiResponseCountRef: RefLike<number>;
  serviceRef: RefLike<VoiceInputServiceType | null>;
  svcUnsubscribesRef: RefLike<Array<() => void>>;
  handleSttResult: (result: import('../services/VoiceInputService').SttResult) => Promise<void>;
  clearInteractionPrompts: () => void;
  startDictationPipeline: () => void;
  stopDictationPipeline: () => void;
  loadIntentRouterRuntime: () => Promise<typeof import('../services/IntentRouter')>;
  loadVoiceIntentRefineRuntime: () => Promise<typeof import('../services/voiceIntentRefine')>;
  loadVoiceInputRuntime: () => Promise<typeof import('../services/VoiceInputService')>;
  loadSttRuntime: () => Promise<typeof import('../services/stt')>;
  loadSttStrategyRuntime: () => Promise<typeof import('../services/SttStrategyRouter')>;
  setMode: (value: VoiceAgentMode) => void;
  setError: (value: string | null) => void;
  setSession: React.Dispatch<React.SetStateAction<import('../services/IntentRouter').VoiceSession>>;
  setAgentState: (value: 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking') => void;
  setListening: (value: boolean) => void;
  setSpeechActive: (value: boolean) => void;
  setEnergyLevel: (value: number) => void;
  voiceActivateGenerationRef: RefLike<number>;
  exclusiveStartPromiseRef: RefLike<Promise<void> | null>;
}

function resolveEffectiveLang(
  langOverride: string | null | undefined,
  corpusLang: string,
): string {
  if (langOverride === '__auto__') return '';
  if (langOverride) return toBcp47(langOverride);
  return toBcp47(corpusLang);
}

async function loadAliasMap(
  loadIntentRouterRuntime: UseVoiceAgentStartControllerOptions['loadIntentRouterRuntime'],
  loadVoiceIntentRefineRuntime: UseVoiceAgentStartControllerOptions['loadVoiceIntentRefineRuntime'],
): Promise<Record<string, string>> {
  try {
    const [intentRouter] = await Promise.all([
      loadIntentRouterRuntime(),
      loadVoiceIntentRefineRuntime(),
    ]);
    return intentRouter.loadVoiceIntentAliasMap();
  } catch (e) {
    console.warn('Failed to load voice intent alias map', e);
    return {};
  }
}

async function ensureVoiceInputService(
  serviceRef: RefLike<VoiceInputServiceType | null>,
  loadVoiceInputRuntime: UseVoiceAgentStartControllerOptions['loadVoiceInputRuntime'],
): Promise<VoiceInputServiceType> {
  if (serviceRef.current) return serviceRef.current;
  const { VoiceInputService } = await loadVoiceInputRuntime();
  const service = new VoiceInputService();
  serviceRef.current = service;
  return service;
}

async function resolveBatteryLevel(): Promise<number | undefined> {
  if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
    return undefined;
  }
  try {
    type BatteryManager = { level: number };
    const battery = await (navigator as unknown as { getBattery(): Promise<BatteryManager> }).getBattery();
    return battery.level;
  } catch (error) {
    log.warn('Battery API probing failed, fallback to default STT strategy context', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export function useVoiceAgentStartController({
  locale,
  listening,
  corpusLang,
  whisperServerUrl,
  whisperServerModel,
  dictationPipeline,
  modeRef,
  engineRef,
  langOverrideRef,
  commercialProviderKindRef,
  commercialProviderConfigRef,
  sttEnhancementKindRef,
  sttEnhancementConfigRef,
  aliasMapRef,
  energyLevelRef,
  pendingAiResponseCountRef,
  serviceRef,
  svcUnsubscribesRef,
  handleSttResult,
  clearInteractionPrompts,
  startDictationPipeline,
  stopDictationPipeline,
  loadIntentRouterRuntime,
  loadVoiceIntentRefineRuntime,
  loadVoiceInputRuntime,
  loadSttRuntime,
  loadSttStrategyRuntime,
  setMode,
  setError,
  setSession,
  setAgentState,
  setListening,
  setSpeechActive,
  setEnergyLevel,
  voiceActivateGenerationRef,
  exclusiveStartPromiseRef,
}: UseVoiceAgentStartControllerOptions) {
  return useCallback(async (targetMode?: VoiceAgentMode) => {
    if (listening) return;
    if (exclusiveStartPromiseRef.current) {
      return exclusiveStartPromiseRef.current;
    }

    const p = (async (): Promise<void> => {
      const gen = ++voiceActivateGenerationRef.current;
      const resetStartUi = (): void => {
        setListening(false);
        setSpeechActive(false);
        setAgentState('idle');
      };

      const nextMode = targetMode ?? modeRef.current;
      const effectiveLang = resolveEffectiveLang(langOverrideRef.current, corpusLang);
      if (targetMode) setMode(targetMode);
      setError(null);
      clearInteractionPrompts();
      setSession(createVoiceSessionState());
      pendingAiResponseCountRef.current = 0;
      setAgentState('listening');

      aliasMapRef.current = await loadAliasMap(loadIntentRouterRuntime, loadVoiceIntentRefineRuntime);
      if (abortStaleMicStart(gen, voiceActivateGenerationRef, serviceRef, resetStartUi)) return;

      const service = await ensureVoiceInputService(serviceRef, loadVoiceInputRuntime);
      if (abortStaleMicStart(gen, voiceActivateGenerationRef, serviceRef, resetStartUi)) return;

      bindVoiceInputService({
        service,
        unsubscribesRef: svcUnsubscribesRef,
        handleSttResult,
        setError,
        setListening,
        setSpeechActive,
        setEnergyLevel,
        energyLevelRef,
        onErrorSound: Earcon.playError,
      });

      const [batteryLevel, region, { chooseSttEngine }] = await Promise.all([
        resolveBatteryLevel(),
        detectRegion(),
        loadSttStrategyRuntime(),
      ]);
      if (abortStaleMicStart(gen, voiceActivateGenerationRef, serviceRef, resetStartUi)) return;

      const runtimeEngine = chooseSttEngine({
        preferred: engineRef.current,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        noiseLevel: energyLevelRef.current,
        ...(batteryLevel !== undefined ? { batteryLevel } : {}),
        regionHint: region,
      });

      const startConfig: Parameters<typeof service.start>[0] = {
        lang: effectiveLang,
        continuous: true,
        interimResults: true,
        preferredEngine: runtimeEngine,
        region,
        maxAlternatives: 3,
      };
      if (runtimeEngine === 'whisper-local') {
        startConfig.whisperServerUrl = whisperServerUrl;
        startConfig.whisperServerModel = whisperServerModel;
      }
      if ((runtimeEngine === 'commercial' && commercialProviderConfigRef.current) || sttEnhancementKindRef.current !== 'none') {
        const { createCommercialProvider, createSttEnhancementProvider } = await loadSttRuntime();
        if (abortStaleMicStart(gen, voiceActivateGenerationRef, serviceRef, resetStartUi)) return;

        if (sttEnhancementKindRef.current !== 'none') {
          startConfig.sttEnhancement = createSttEnhancementProvider(sttEnhancementKindRef.current);
          if (sttEnhancementConfigRef.current) {
            startConfig.sttEnhancementConfig = sttEnhancementConfigRef.current;
          }
        }
        if (runtimeEngine === 'commercial' && commercialProviderConfigRef.current) {
          startConfig.commercialFallback = createCommercialProvider(
            commercialProviderKindRef.current,
            commercialProviderConfigRef.current,
          );
        }
      }

      try {
        await service.start(startConfig);
      } catch (err) {
        setListening(false);
        setSpeechActive(false);
        setAgentState('idle');
        setError(err instanceof Error ? err.message : t(locale, 'transcription.voice.error.startFailed'));
        Earcon.playError();
        return;
      }

      if (abortStaleMicStart(gen, voiceActivateGenerationRef, serviceRef, resetStartUi)) return;

      setAgentState(runtimeEngine === 'web-speech' ? 'listening' : 'idle');
      if (nextMode === 'dictation' && dictationPipeline) {
        startDictationPipeline();
      } else {
        stopDictationPipeline();
      }
      void unlockAudio();
      Earcon.playActivate();
    })();

    exclusiveStartPromiseRef.current = p;
    void p.finally(() => {
      if (exclusiveStartPromiseRef.current === p) {
        exclusiveStartPromiseRef.current = null;
      }
    });
    return p;
  }, [
    aliasMapRef,
    clearInteractionPrompts,
    commercialProviderConfigRef,
    commercialProviderKindRef,
    corpusLang,
    dictationPipeline,
    energyLevelRef,
    exclusiveStartPromiseRef,
    engineRef,
    handleSttResult,
    langOverrideRef,
    listening,
    loadIntentRouterRuntime,
    loadSttRuntime,
    loadSttStrategyRuntime,
    loadVoiceInputRuntime,
    loadVoiceIntentRefineRuntime,
    locale,
    modeRef,
    pendingAiResponseCountRef,
    serviceRef,
    sttEnhancementConfigRef,
    sttEnhancementKindRef,
    setAgentState,
    setEnergyLevel,
    setError,
    setListening,
    setMode,
    setSession,
    setSpeechActive,
    startDictationPipeline,
    stopDictationPipeline,
    svcUnsubscribesRef,
    voiceActivateGenerationRef,
    whisperServerModel,
    whisperServerUrl,
  ]);
}
