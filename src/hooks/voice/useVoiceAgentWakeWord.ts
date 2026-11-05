import { useEffect, useRef } from 'react';
import type { WakeWordDetector as WakeWordDetectorType } from '../../services/WakeWordDetector';

interface RefLike<T> {
  current: T;
}

interface UseVoiceAgentWakeWordOptions {
  wakeWordEnabled: boolean;
  listening: boolean;
  wakeWordDetectorRef: RefLike<WakeWordDetectorType | null>;
  loadWakeWordRuntime: () => Promise<typeof import('../../services/WakeWordDetector')>;
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
  // Keep latest callbacks in refs so energy-driven re-renders (setWakeWordEnergyLevel)
  // do not rebuild the detector and reset speechMs accumulation (#517).
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  const setWakeWordEnergyLevelRef = useRef(setWakeWordEnergyLevel);
  setWakeWordEnergyLevelRef.current = setWakeWordEnergyLevel;
  const setWakeWordEnabledStateRef = useRef(setWakeWordEnabledState);
  setWakeWordEnabledStateRef.current = setWakeWordEnabledState;

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
        onWake: () => {
          onWakeRef.current();
        },
        onEnergy: (rms) => {
          setWakeWordEnergyLevelRef.current(rms);
        },
      });

      wakeWordDetectorRef.current = detector;
      detector.start().catch(() => {
        setWakeWordEnabledStateRef.current(false);
      });
    })();

    return () => {
      disposed = true;
      wakeWordDetectorRef.current?.stop();
      wakeWordDetectorRef.current = null;
    };
  }, [listening, loadWakeWordRuntime, wakeWordDetectorRef, wakeWordEnabled]);
}
