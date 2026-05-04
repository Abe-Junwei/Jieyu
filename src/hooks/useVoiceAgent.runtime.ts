import type { VoiceSession } from '../services/IntentRouter';
import { DEFAULT_VOICE_MODE } from '../services/voiceMode';

export {
  loadSttRuntime,
  loadSttStrategyRuntime,
  loadVoiceInputRuntime,
  loadWakeWordRuntime,
} from '../services/voiceRuntimeLoaders';

let intentRouterRuntime: typeof import('../services/IntentRouter') | null = null;
let intentRouterRuntimePromise: Promise<typeof import('../services/IntentRouter')> | null = null;
let voiceIntentRefineRuntime: typeof import('../services/voiceIntentRefine') | null = null;
let voiceIntentRefineRuntimePromise: Promise<typeof import('../services/voiceIntentRefine')> | null = null;
let voiceSessionStoreRuntime: typeof import('../services/VoiceSessionStore') | null = null;
let voiceSessionStoreRuntimePromise: Promise<typeof import('../services/VoiceSessionStore')> | null = null;

export function loadIntentRouterRuntime() {
  if (intentRouterRuntime) {
    return Promise.resolve(intentRouterRuntime);
  }
  if (!intentRouterRuntimePromise) {
    intentRouterRuntimePromise = import('../services/IntentRouter').then((runtime) => {
      intentRouterRuntime = runtime;
      return runtime;
    });
  }
  return intentRouterRuntimePromise;
}

export function loadVoiceIntentRefineRuntime() {
  if (voiceIntentRefineRuntime) {
    return Promise.resolve(voiceIntentRefineRuntime);
  }
  if (!voiceIntentRefineRuntimePromise) {
    voiceIntentRefineRuntimePromise = import('../services/voiceIntentRefine').then((runtime) => {
      voiceIntentRefineRuntime = runtime;
      return runtime;
    });
  }
  return voiceIntentRefineRuntimePromise;
}

export function loadVoiceSessionStoreRuntime() {
  if (voiceSessionStoreRuntime) {
    return Promise.resolve(voiceSessionStoreRuntime);
  }
  if (!voiceSessionStoreRuntimePromise) {
    voiceSessionStoreRuntimePromise = import('../services/VoiceSessionStore').then((runtime) => {
      voiceSessionStoreRuntime = runtime;
      return runtime;
    });
  }
  return voiceSessionStoreRuntimePromise;
}

export function createVoiceSessionState(): VoiceSession {
  return {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    entries: [],
    mode: DEFAULT_VOICE_MODE,
  };
}
