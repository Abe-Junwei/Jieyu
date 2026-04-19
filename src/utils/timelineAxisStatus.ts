/**
 * 时间轴顶栏媒体可播性提示（ADR-0004 7A）。**语段时间**不由本模块推断；仅汇总壳层与 `max(endTime)`。
 */
import type { LayerUnitDocType, MediaItemDocType } from '../db';
import { isMediaItemPlaceholderRow } from './mediaItemTimelineKind';
import { resolveTimelineShellMode } from './timelineShellMode';

export type TimelineAxisMediaHint =
  | { kind: 'hidden' }
  | { kind: 'acoustic_decoding' }
  | { kind: 'no_playable_media'; sub: 'placeholder' | 'no_blob' }
  | { kind: 'duration_short'; acousticSec: number; maxUnitEndSec: number }
  | { kind: 'acoustic_ok'; acousticSec: number };

/**
 * 顶栏逻辑轴长度行是否与媒体状态条一并展示（`TimelineAxisStatusStrip` 与 ReadyWorkspace 编排共用，ADR-0004 7A）。
 */
export function shouldShowLogicalAxisLengthOnAxisStrip(input: {
  logicalDurationSec?: number;
  timelineMode?: string | null;
  hintKind: TimelineAxisMediaHint['kind'];
}): boolean {
  const d = input.logicalDurationSec;
  if (!(typeof d === 'number' && Number.isFinite(d) && d > 0)) return false;
  const m = input.timelineMode;
  if (!(m === 'document' || m === 'media')) return false;
  return input.hintKind === 'no_playable_media';
}

export function maxUnitEndTimeSec(units: ReadonlyArray<Pick<LayerUnitDocType, 'endTime'>>): number {
  return units.reduce((m, u) => (Number.isFinite(u.endTime) ? Math.max(m, u.endTime) : m), 0);
}

export interface ResolveTimelineAxisStatusInput {
  layersCount: number;
  selectedMediaUrl: string | null | undefined;
  playerIsReady: boolean;
  playerDuration: number;
  selectedTimelineMedia: Pick<MediaItemDocType, 'filename' | 'details'> | null | undefined;
  unitsOnCurrentMedia: ReadonlyArray<Pick<LayerUnitDocType, 'endTime'>>;
}

/**
 * 时间轴顶栏：媒体可播性 / 解码中 / 语段超出声学时长（ADR-0004 阶段 7A）。
 */
export function resolveTimelineAxisStatus(input: ResolveTimelineAxisStatusInput): TimelineAxisMediaHint {
  if (input.layersCount <= 0) return { kind: 'hidden' };

  const { shell, acousticPending } = resolveTimelineShellMode({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: input.layersCount,
  });

  if (acousticPending) return { kind: 'acoustic_decoding' };

  const maxEnd = maxUnitEndTimeSec(input.unitsOnCurrentMedia);

  if (shell === 'waveform') {
    const d = input.playerDuration;
    if (d > 0 && maxEnd > d + 0.05) {
      return { kind: 'duration_short', acousticSec: d, maxUnitEndSec: maxEnd };
    }
    return { kind: 'acoustic_ok', acousticSec: d };
  }

  const row = input.selectedTimelineMedia;
  const isPlaceholder = !row || isMediaItemPlaceholderRow(row);
  if (isPlaceholder) return { kind: 'no_playable_media', sub: 'placeholder' };
  return { kind: 'no_playable_media', sub: 'no_blob' };
}
