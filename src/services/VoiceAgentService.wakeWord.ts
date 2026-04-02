/**
 * VoiceAgentService.wakeWord — 唤醒词检测启动辅助
 * Wake-word detector bootstrap helper for VoiceAgentService.
 */

import type { WakeWordDetector as WakeWordDetectorType } from './WakeWordDetector';

export interface StartWakeWordDetectorParams {
  hasDetector: () => boolean;
  loadWakeWordRuntime: () => Promise<typeof import('./WakeWordDetector')>;
  instantiateDetector: (Ctor: typeof import('./WakeWordDetector').WakeWordDetector) => WakeWordDetectorType;
  setDetector: (detector: WakeWordDetectorType | null) => void;
  onStartFailed: (error: unknown) => void;
  onSetupFailed: (error: unknown) => void;
}

export function startWakeWordDetectorRuntime(params: StartWakeWordDetectorParams): void {
  if (params.hasDetector()) return;
  void (async () => {
    try {
      const { WakeWordDetector } = await params.loadWakeWordRuntime();
      if (params.hasDetector()) return;
      const detector = params.instantiateDetector(WakeWordDetector);
      params.setDetector(detector);
      detector.start().catch((err) => {
        params.setDetector(null);
        params.onStartFailed(err);
      });
    } catch (err) {
      params.setDetector(null);
      params.onSetupFailed(err);
    }
  })();
}
