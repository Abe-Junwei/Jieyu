import type { SttEngine } from './VoiceInputService';
import type { Region } from '../utils/regionDetection';

export interface SttStrategyInput {
  preferred: SttEngine;
  online: boolean;
  noiseLevel?: number;
  batteryLevel?: number;
  regionHint?: Region;
}

/**
 * STT strategy router (lightweight version).
 * 中文说明 | English:
 * 根据网络、噪声与电量进行保守路由，优先保证可用性并避免明显错误选择。
 */
export function chooseSttEngine(input: SttStrategyInput): SttEngine {
  const noise = input.noiseLevel ?? 0;
  const battery = input.batteryLevel ?? 1;

  if (!input.online) {
    return input.preferred === 'commercial' ? 'whisper-local' : input.preferred;
  }

  if (battery <= 0.15) {
    // CN 用户低电量回退到 commercial（web-speech 不可用）| CN users fall back to commercial on low battery
    return input.regionHint === 'cn' ? 'commercial' : 'web-speech';
  }

  if (noise >= 0.08) {
    return 'commercial';
  }

  return input.preferred;
}
