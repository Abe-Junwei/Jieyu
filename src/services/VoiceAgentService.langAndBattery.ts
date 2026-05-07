/**
 * Small helpers extracted from VoiceAgentService (P2 line budget).
 */

import { createLogger } from '../observability/logger';
import { toBcp47 } from '../utils/langMapping';

const log = createLogger('VoiceAgentService');

export function resolveVoiceAgentEffectiveLang(input: {
  langOverride: string | null;
  corpusLang: string;
}): string {
  const override = input.langOverride;
  if (override === '__auto__') {
    return '';
  }
  if (override) {
    return toBcp47(override) ?? input.corpusLang;
  }
  return toBcp47(input.corpusLang) ?? input.corpusLang;
}

export function scheduleVoiceAgentBatteryLevelRefresh(setBatteryLevel: (level: number) => void): void {
  if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
    return;
  }
  type BatteryManager = { level: number };
  (navigator as unknown as { getBattery(): Promise<BatteryManager> })
    .getBattery()
    .then((b) => {
      setBatteryLevel(b.level);
    })
    .catch((err) => {
      log.error('failed to get battery level', { err });
    });
}
