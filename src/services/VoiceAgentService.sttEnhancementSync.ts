/**
 * STT enhancement sync — extracted from VoiceAgentService to keep the main file under the P2 line budget.
 */

import { createLogger } from '../observability/logger';
import type { VoiceInputService as VoiceInputServiceType } from './VoiceInputService';
import type { SttEnhancementConfig, SttEnhancementSelectionKind } from './stt';
import { loadSttRuntime } from './voiceRuntimeLoaders';

const log = createLogger('VoiceAgentService');

export function scheduleSyncVoiceServiceSttEnhancement(input: {
  getVoiceService: () => VoiceInputServiceType | null;
  enhancementKind: SttEnhancementSelectionKind;
  enhancementConfig: SttEnhancementConfig;
}): void {
  const voiceService = input.getVoiceService();
  if (!voiceService) {
    return;
  }

  if (input.enhancementKind === 'none') {
    voiceService.setSttEnhancement(undefined, undefined);
    return;
  }

  void loadSttRuntime()
    .then(({ createSttEnhancementProvider }) => {
      const svc = input.getVoiceService();
      if (!svc) {
        return;
      }

      if (input.enhancementKind === 'none') {
        svc.setSttEnhancement(undefined, undefined);
        return;
      }

      svc.setSttEnhancement(
        createSttEnhancementProvider(input.enhancementKind),
        input.enhancementConfig,
      );
    })
    .catch((error) => {
      log.warn('failed to sync STT enhancement config to VoiceInputService', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
