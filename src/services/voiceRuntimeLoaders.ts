/**
 * Shared lazy `import()` promises for voice-heavy runtimes (STT stack, mic, wake word).
 *
 * `useVoiceAgent.runtime` (Hook 路径) 与 `VoiceAgentService`（Service 路径）必须共用本模块，
 * 避免双份 promise 导致分包缓存、manifest 失败语义或热路径行为漂移（Phase A，ADR-0028）。
 */

let voiceInputRuntimePromise: Promise<typeof import('./VoiceInputService')> | null = null;
let wakeWordRuntimePromise: Promise<typeof import('./WakeWordDetector')> | null = null;
let sttRuntimePromise: Promise<typeof import('./stt')> | null = null;
let sttStrategyRuntimePromise: Promise<typeof import('./SttStrategyRouter')> | null = null;

export function loadVoiceInputRuntime() {
  if (!voiceInputRuntimePromise) {
    voiceInputRuntimePromise = import('./VoiceInputService');
  }
  return voiceInputRuntimePromise;
}

export function loadWakeWordRuntime() {
  if (!wakeWordRuntimePromise) {
    wakeWordRuntimePromise = import('./WakeWordDetector');
  }
  return wakeWordRuntimePromise;
}

export function loadSttRuntime() {
  if (!sttRuntimePromise) {
    sttRuntimePromise = import('./stt');
  }
  return sttRuntimePromise;
}

export function loadSttStrategyRuntime() {
  if (!sttStrategyRuntimePromise) {
    sttStrategyRuntimePromise = import('./SttStrategyRouter');
  }
  return sttStrategyRuntimePromise;
}
