/**
 * WhisperX VAD binding for VoiceInputService (Phase C2 split).
 */

import { createLogger } from '../observability/logger';
import { recommendVadStrategy } from './SttStrategyRouter';
import type { VoiceInputSttEngine } from './VoiceInputService.fallbackChain';
import { WhisperXVadService } from './vad/WhisperXVadService';

const log = createLogger('VoiceInputService.vadSync');

export function voiceInputShouldUseVadForEngine(params: {
  engine: VoiceInputSttEngine;
  vadEnabled?: boolean;
  /** Override navigator.onLine for tests. */
  navigatorOnline?: boolean;
}): boolean {
  const online =
    params.navigatorOnline ??
    (typeof navigator === 'undefined' ? true : navigator.onLine);
  return recommendVadStrategy({
    preferred: params.engine,
    online,
    ...(params.vadEnabled !== undefined && { vadEnabled: params.vadEnabled }),
  });
}

export interface VoiceInputVadSyncPorts {
  getVadService: () => WhisperXVadService | null;
  setVadService: (v: WhisperXVadService | null) => void;
  setRecordingVad: (v: WhisperXVadService | null) => void;
  isDisposed: () => boolean;
  getCurrentEngine: () => VoiceInputSttEngine;
}

/**
 * Keeps RecordingExecutor VAD wiring aligned with the active STT engine.
 * Lazily constructs WhisperXVadService on first need.
 */
export function syncVoiceInputVadForEngine(
  engine: VoiceInputSttEngine,
  vadEnabled: boolean | undefined,
  ports: VoiceInputVadSyncPorts,
): void {
  const useVad = voiceInputShouldUseVadForEngine({
    engine,
    ...(vadEnabled !== undefined && { vadEnabled }),
  });

  if (useVad && !ports.getVadService()) {
    const vadService = new WhisperXVadService();
    ports.setVadService(vadService);
    vadService.init().then(() => {
      if (ports.isDisposed() || ports.getVadService() !== vadService) {
        return;
      }
      log.debug('WhisperX VAD initialized');
      ports.setRecordingVad(
        voiceInputShouldUseVadForEngine({
          engine: ports.getCurrentEngine(),
          ...(vadEnabled !== undefined && { vadEnabled }),
        })
          ? vadService
          : null,
      );
    }).catch((err) => {
      if (ports.getVadService() === vadService) {
        ports.setVadService(null);
      }
      log.warn('WhisperX VAD init failed, proceeding without VAD', {
        error: err instanceof Error ? err.message : String(err),
      });
      ports.setRecordingVad(null);
    });
    return;
  }

  if (useVad && ports.getVadService()) {
    ports.setRecordingVad(ports.getVadService());
    return;
  }

  ports.setRecordingVad(null);
}
