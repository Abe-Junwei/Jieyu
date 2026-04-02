import type { MutableRefObject } from 'react';
import type { VoiceInputService as VoiceInputServiceType, SttResult } from '../services/VoiceInputService';

interface BindVoiceInputServiceOptions {
  service: VoiceInputServiceType;
  unsubscribesRef: MutableRefObject<Array<() => void>>;
  handleSttResult: (result: SttResult) => Promise<void>;
  setError: (error: string) => void;
  setListening: (listening: boolean) => void;
  setSpeechActive: (speaking: boolean) => void;
  setEnergyLevel: (rms: number) => void;
  energyLevelRef: MutableRefObject<number>;
  onErrorSound: () => void;
}

export function cleanupVoiceInputSubscriptions(unsubscribesRef: MutableRefObject<Array<() => void>>) {
  for (const unsubscribe of unsubscribesRef.current) {
    unsubscribe();
  }
  unsubscribesRef.current = [];
}

export function bindVoiceInputService(options: BindVoiceInputServiceOptions) {
  cleanupVoiceInputSubscriptions(options.unsubscribesRef);

  options.unsubscribesRef.current.push(options.service.onResult(options.handleSttResult));
  options.unsubscribesRef.current.push(options.service.onError((error) => {
    options.setError(error);
    options.onErrorSound();
  }));
  options.unsubscribesRef.current.push(options.service.onStateChange(options.setListening));

  if ('onVadStateChange' in options.service && typeof options.service.onVadStateChange === 'function') {
    options.unsubscribesRef.current.push(options.service.onVadStateChange(options.setSpeechActive));
  }

  if ('onEnergyLevel' in options.service && typeof options.service.onEnergyLevel === 'function') {
    options.unsubscribesRef.current.push(options.service.onEnergyLevel((rms) => {
      options.energyLevelRef.current = rms;
      options.setEnergyLevel(rms);
    }));
  }
}
