/**
 * Centralizes waveform vs text-only vs empty timeline shell (ADR-0004 phase 2).
 * Player readiness stays separate from text.metadata.timelineMode.
 *
 * 壳层只影响「是否显示波形/占位」；**语段起止时间**仍以库内坐标为准，不在此按索引或均分生成时间。
 */

import type { TimelineAcousticState } from './mapAcousticToTimelineChrome';

export type TimelineShellKind = 'waveform' | 'text-only' | 'empty';

/**
 * 与 `useTranscriptionTimelineContentViewModel` 中 `effectiveLayersCount` 同构，保证 read model 与 timeline content 壳判定输入一致。
 */
export function computeEffectiveTimelineShellLayersCount(input: {
  orchestratorLayersCount: number;
  transcriptionLayerCount: number;
  translationLayerCount: number;
}): number {
  return Math.max(
    input.orchestratorLayersCount,
    input.transcriptionLayerCount,
    input.translationLayerCount,
  );
}

export interface TimelineShellModeInput {
  selectedMediaUrl: string | null | undefined;
  playerIsReady: boolean;
  playerDuration: number;
  layersCount: number;
  verticalViewEnabled?: boolean;
}

export interface TimelineShellModeResult {
  shell: TimelineShellKind;
  /** URL present but decode not ready or duration not yet positive — text-only shell with optional loading chrome */
  acousticPending: boolean;
  /** True only when a playable acoustic URL is decoded and ready. */
  playableAcoustic: boolean;
}

/**
 * 与 `buildTimelineReadModel` 中 `resolveAcousticState` 同构：由壳层判定结果得到声学三态（供 `mapAcousticToTimelineChrome` 等消费）。
 */
export function timelineShellModeResultToAcousticState(result: TimelineShellModeResult): TimelineAcousticState {
  if (result.playableAcoustic) return 'playable';
  if (result.acousticPending) return 'pending_decode';
  return 'no_media';
}

export function resolveTimelineShellMode(input: TimelineShellModeInput): TimelineShellModeResult {
  const hasLayers = input.layersCount > 0;
  const hasUrl = typeof input.selectedMediaUrl === 'string' && input.selectedMediaUrl.trim().length > 0;
  const acousticPlayable = hasUrl && input.playerIsReady && input.playerDuration > 0;
  const acousticPending = Boolean(hasUrl && hasLayers && (!input.playerIsReady || input.playerDuration <= 0));
  const verticalViewEnabled = input.verticalViewEnabled === true;

  if (verticalViewEnabled && hasLayers) {
    return { shell: 'text-only', acousticPending: false, playableAcoustic: false };
  }
  if (acousticPlayable && hasLayers) {
    return { shell: 'waveform', acousticPending: false, playableAcoustic: acousticPlayable };
  }
  if (hasLayers) {
    return { shell: 'text-only', acousticPending, playableAcoustic: false };
  }
  return { shell: 'empty', acousticPending: false, playableAcoustic: false };
}
