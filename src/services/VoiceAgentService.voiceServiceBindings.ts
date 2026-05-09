import type { VoiceInputService as VoiceInputServiceType } from './VoiceInputService';
import type { SttResult } from './VoiceInputService.types';
import type { VoiceAgentServiceState } from './VoiceAgentService.types';

export function createVoiceAgentServiceVoiceInputHandlers(input: {
  onResult: (result: SttResult) => void;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  playError: () => void;
}): {
  onResult: (result: SttResult) => void;
  onError: (err: string) => void;
  onListeningChange: (listening: boolean) => void;
  onSpeechActiveChange: (active: boolean) => void;
  onEnergyLevel: (rms: number) => void;
} {
  return {
    onResult: input.onResult,
    onError: (err) => {
      input.setState({ error: err, agentState: 'idle' });
      input.playError();
    },
    onListeningChange: (listening) => {
      input.setState({ listening, agentState: listening ? 'listening' : 'idle' });
    },
    onSpeechActiveChange: (active) => {
      input.setState({ speechActive: active });
    },
    onEnergyLevel: (rms) => {
      input.setState({ energyLevel: rms });
    },
  };
}

export function bindVoiceAgentServiceVoiceInputHandlers(input: {
  voiceService: VoiceInputServiceType;
  onResult: (result: SttResult) => void;
  onError: (err: string) => void;
  onListeningChange: (listening: boolean) => void;
  onSpeechActiveChange: (active: boolean) => void;
  onEnergyLevel: (rms: number) => void;
}): void {
  const svc = input.voiceService;
  svc.onResult(input.onResult);
  svc.onError(input.onError);
  svc.onStateChange(input.onListeningChange);

  if ('onVadStateChange' in svc && typeof svc.onVadStateChange === 'function') {
    (
      svc as VoiceInputServiceType & {
        onVadStateChange: (fn: (active: boolean) => void) => void;
      }
    ).onVadStateChange(input.onSpeechActiveChange);
  }

  if ('onEnergyLevel' in svc && typeof svc.onEnergyLevel === 'function') {
    (
      svc as VoiceInputServiceType & {
        onEnergyLevel: (fn: (rms: number) => void) => void;
      }
    ).onEnergyLevel(input.onEnergyLevel);
  }
}
