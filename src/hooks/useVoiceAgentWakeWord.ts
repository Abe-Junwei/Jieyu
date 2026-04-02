import { useEffect } from 'react';
import type { WakeWordDetector as WakeWordDetectorType } from '../services/WakeWordDetector';

interface RefLike<T> {
  current: T;
}

interface UseVoiceAgentWakeWordOptions {
  wakeWordEnabled: boolean;
  listening: boolean;
  wakeWordDetectorRef: RefLike<WakeWordDetectorType | null>;
  loadWakeWordRuntime: () => Promise<typeof import('../services/WakeWordDetector')>;
  setWakeWordEnabledState: (value: boolean) => void;
  setWakeWordEnergyLevel: (value: number) => void;
  onWake: () => void;
}

export function useVoiceAgentWakeWord({
  wakeWordEnabled,
  listening,
  wakeWordDetectorRef,
  loadWakeWordRuntime,
  setWakeWordEnabledState,
  setWakeWordEnergyLevel,
  onWake,
}: UseVoiceAgentWakeWordOptions) {
  useEffect(() => {
    if (!wakeWordEnabled) {
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
      return;
    }
    if (listening) return;

    let disposed = false;
    void (async () => {
      const { WakeWordDetector } = await loadWakeWordRuntime();
      if (disposed) return;
      const detector = new WakeWordDetector({
        energyThreshold: 0.05,
        speechMs: 400,
        cooldownMs: 3000,
        onWake,
        onEnergy: (rms) => {
          setWakeWordEnergyLevel(rms);
        },
      });

      wakeWordDetectorRef.current = detector;
      detector.start().catch(() => {
        setWakeWordEnabledState(false);
      });
    })();

    return () => {
      disposed = true;
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
    };
  }, [
    listening,
    loadWakeWordRuntime,
    onWake,
    setWakeWordEnabledState,
    setWakeWordEnergyLevel,
    wakeWordDetectorRef,
    wakeWordEnabled,
  ]);
}
