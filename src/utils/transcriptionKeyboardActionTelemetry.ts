/**
 * Facade for transcription keyboard / text-input behavior telemetry.
 * Pages import from here so `page→services` stays within architecture-guard M3;
 * implementation remains in `src/services/transcriptionKeyboardActionTelemetry.ts`.
 */

import {
  recordTranscriptionKeyboardAction as recordTranscriptionKeyboardActionFromService,
  TRANSCRIPTION_TEXT_INPUT_BEHAVIOR_SESSION_ID,
} from '../services/transcriptionKeyboardActionTelemetry';

export const recordTranscriptionKeyboardAction = recordTranscriptionKeyboardActionFromService;
export { TRANSCRIPTION_TEXT_INPUT_BEHAVIOR_SESSION_ID };

let lastToolbarVolumeTelemetryMs = 0;
const TOOLBAR_VOLUME_TELEMETRY_INTERVAL_MS = 350;

/** Throttled `toolbarVolumeChange` telemetry for high-frequency volume slider drags. */
export function recordToolbarVolumeChangeTelemetryThrottled(): void {
  const now = Date.now();
  if (now - lastToolbarVolumeTelemetryMs < TOOLBAR_VOLUME_TELEMETRY_INTERVAL_MS) return;
  lastToolbarVolumeTelemetryMs = now;
  recordTranscriptionKeyboardActionFromService('toolbarVolumeChange');
}
