/**
 * Wake-word wiring for VoiceAgentService (extracted for P2 line budget).
 */

import type { WakeWordDetector as WakeWordDetectorType } from './WakeWordDetector';
import { startWakeWordDetectorRuntime } from './VoiceAgentService.wakeWord';
import { loadWakeWordRuntime } from './voiceRuntimeLoaders';

export function bindVoiceAgentWakeWordStart(input: {
  getHasDetector: () => boolean;
  setDetector: (detector: WakeWordDetectorType | null) => void;
  onWake: () => void;
  onWakeEnergy: (rms: number) => void;
  onStartFailed: (err: unknown) => void;
  onSetupFailed: (err: unknown) => void;
}): void {
  startWakeWordDetectorRuntime({
    hasDetector: input.getHasDetector,
    loadWakeWordRuntime,
    instantiateDetector: (WakeWordDetector) =>
      new WakeWordDetector({
        energyThreshold: 0.05,
        speechMs: 400,
        cooldownMs: 3000,
        onWake: input.onWake,
        onEnergy: input.onWakeEnergy,
      }),
    setDetector: input.setDetector,
    onStartFailed: input.onStartFailed,
    onSetupFailed: input.onSetupFailed,
  });
}
