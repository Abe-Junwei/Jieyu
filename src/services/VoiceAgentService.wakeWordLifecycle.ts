import type { WakeWordDetector as WakeWordDetectorType } from './WakeWordDetector';
import { bindVoiceAgentWakeWordStart } from './VoiceAgentService.wakeWordBindings';
import { applyVoiceAgentWakeWordFailure } from './VoiceAgentService.wakeWordFailure';
import type { VoiceAgentServiceState } from './VoiceAgentService.types';

export function startVoiceAgentWakeWordLifecycle(input: {
  getHasDetector: () => boolean;
  setDetector: (detector: WakeWordDetectorType | null) => void;
  onWake: () => void;
  setWakeWordEnergyLevel: (rms: number) => void;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
}): void {
  bindVoiceAgentWakeWordStart({
    getHasDetector: input.getHasDetector,
    setDetector: input.setDetector,
    onWake: input.onWake,
    onWakeEnergy: input.setWakeWordEnergyLevel,
    onStartFailed: (err) => {
      applyVoiceAgentWakeWordFailure({
        kind: 'start',
        err,
        setState: input.setState,
      });
    },
    onSetupFailed: (err) => {
      applyVoiceAgentWakeWordFailure({
        kind: 'setup',
        err,
        setState: input.setState,
      });
    },
  });
}

export function stopVoiceAgentWakeWordLifecycle(
  detector: WakeWordDetectorType | null,
): WakeWordDetectorType | null {
  detector?.stop();
  return null;
}
