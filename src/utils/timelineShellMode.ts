/**
 * Centralizes waveform vs text-only vs empty timeline shell (ADR-0004 phase 2).
 * Player readiness stays separate from text.metadata.timelineMode.
 */

export type TimelineShellKind = 'waveform' | 'text-only' | 'empty';

export interface TimelineShellModeInput {
  selectedMediaUrl: string | null | undefined;
  playerIsReady: boolean;
  playerDuration: number;
  layersCount: number;
  timelineMode?: 'document' | 'media' | null;
  fallbackDurationSec?: number | null;
}

export interface TimelineShellModeResult {
  shell: TimelineShellKind;
  /** URL present but decode not ready or duration not yet positive — text-only shell with optional loading chrome */
  acousticPending: boolean;
  /** True only when a playable acoustic URL is decoded and ready. */
  playableAcoustic: boolean;
}

export function resolveTimelineShellMode(input: TimelineShellModeInput): TimelineShellModeResult {
  const hasLayers = input.layersCount > 0;
  const hasUrl = typeof input.selectedMediaUrl === 'string' && input.selectedMediaUrl.trim().length > 0;
  const fallbackDurationSec = typeof input.fallbackDurationSec === 'number' && Number.isFinite(input.fallbackDurationSec)
    ? input.fallbackDurationSec
    : 0;
  const acousticPlayable = hasUrl && input.playerIsReady && input.playerDuration > 0;
  const acousticPending = Boolean(hasUrl && hasLayers && (!input.playerIsReady || input.playerDuration <= 0));
  const timedMediaWithoutUrl = !hasUrl
    && hasLayers
    && input.timelineMode === 'media'
    && Math.max(input.playerDuration, fallbackDurationSec) > 0;

  if ((acousticPlayable || timedMediaWithoutUrl) && hasLayers) {
    return { shell: 'waveform', acousticPending: false, playableAcoustic: acousticPlayable };
  }
  if (hasLayers) {
    return { shell: 'text-only', acousticPending, playableAcoustic: false };
  }
  return { shell: 'empty', acousticPending: false, playableAcoustic: false };
}
