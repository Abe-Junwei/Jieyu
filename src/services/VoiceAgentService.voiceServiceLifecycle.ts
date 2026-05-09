import type { VoiceInputService as VoiceInputServiceType } from './VoiceInputService';
import type { SttResult } from './VoiceInputService.types';
import type { VoiceAgentServiceState } from './VoiceAgentService.types';
import {
  bindVoiceAgentServiceVoiceInputHandlers,
  createVoiceAgentServiceVoiceInputHandlers,
} from './VoiceAgentService.voiceServiceBindings';

export async function ensureVoiceAgentServiceBoundInstance(input: {
  currentVoiceService: VoiceInputServiceType | null;
  loadVoiceInputRuntime: () => Promise<{
    VoiceInputService: new () => VoiceInputServiceType;
  }>;
  onResult: (result: SttResult) => void;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  playError: () => void;
}): Promise<VoiceInputServiceType> {
  if (input.currentVoiceService) return input.currentVoiceService;

  const { VoiceInputService } = await input.loadVoiceInputRuntime();
  const voiceService = new VoiceInputService();
  const handlers = createVoiceAgentServiceVoiceInputHandlers({
    onResult: input.onResult,
    setState: input.setState,
    playError: input.playError,
  });
  bindVoiceAgentServiceVoiceInputHandlers({
    voiceService,
    onResult: handlers.onResult,
    onError: handlers.onError,
    onListeningChange: handlers.onListeningChange,
    onSpeechActiveChange: handlers.onSpeechActiveChange,
    onEnergyLevel: handlers.onEnergyLevel,
  });
  return voiceService;
}
