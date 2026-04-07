import type { SttEngine } from './VoiceInputService';
import type { Region } from '../utils/regionDetection';

export interface SttStrategyInput {
  preferred: SttEngine;
  online: boolean;
  noiseLevel?: number;
  batteryLevel?: number;
  regionHint?: Region;
  /**
   * 是否启用 WhisperX VAD Cut & Merge 预分段策略。
   * Whether to enable WhisperX VAD Cut & Merge pre-segmentation.
   * 当为 true 时，调用方应先用 WhisperXVadService 分段后再逐段送 STT。
   * When true, callers should use WhisperXVadService to segment before STT.
   */
  vadEnabled?: boolean;
}

/**
 * VAD 策略建议 | VAD strategy recommendation
 * 根据引擎选择和网络状态建议是否启用 WhisperX VAD。
 * Recommends whether to enable WhisperX VAD based on engine and network state.
 */
export function recommendVadStrategy(input: SttStrategyInput): boolean {
  if (input.vadEnabled !== undefined) return input.vadEnabled;
  // 本地 Whisper 引擎：静默启用 VAD，提升长音频处理效率 | Enable VAD for local Whisper to improve long-audio throughput
  if (input.preferred === 'whisper-local') return true;
  // 离线模式且非本地 Whisper：不启用 VAD | Offline without local Whisper: disable VAD
  if (!input.online) return false;
  return false;
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
