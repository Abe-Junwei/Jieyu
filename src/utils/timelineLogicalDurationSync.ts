import { DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC } from './timelineExtentConstants';

const TIMED_UNIT_EPSILON_SEC = 0.05;

export function maxTimedUnitEndSec(units: ReadonlyArray<{ endTime?: number }>): number {
  let maxEnd = 0;
  for (const unit of units) {
    const endTime = unit.endTime;
    if (typeof endTime === 'number' && Number.isFinite(endTime)) {
      maxEnd = Math.max(maxEnd, endTime);
    }
  }
  return maxEnd;
}

export function hasEstablishedTimedUnits(units: ReadonlyArray<{ endTime?: number }>): boolean {
  return maxTimedUnitEndSec(units) > TIMED_UNIT_EPSILON_SEC;
}

/**
 * 删音 / 删段后写回 `logicalDurationSec`：无对齐语段时回到默认画布，避免旧媒体时长残留。
 */
export function resolveLogicalDurationSecAfterTimedContentChange(input: {
  maxUnitEndSec: number;
  existingLogicalDurationSec: number;
  hasTimedUnits: boolean;
}): number {
  if (input.hasTimedUnits) {
    return Math.max(input.maxUnitEndSec, input.existingLogicalDurationSec, 1);
  }
  return DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;
}

/** 无对齐语段且仍为新建项目默认画布（1800s）时，视为尚未确立文献轴。 */
export function isDefaultBlankTimelineLogical(logicalDurationSec: number): boolean {
  return (
    !(logicalDurationSec > TIMED_UNIT_EPSILON_SEC) ||
    logicalDurationSec === DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC
  );
}

/**
 * 声学导入后写回 `logicalDurationSec`：
 * - 首次 remap / 有对齐语段：沿用 ADR 冻结或 remap 规则；
 * - 空白项目（默认 1800s、无语段）：对齐至媒体时长，避免 3 分钟音频仍显示 30 分钟轴。
 */
export function resolveLogicalDurationAfterAcousticImport(input: {
  prevLogicalSec: number;
  acousticDurationSec: number;
  maxUnitEndSec: number;
  didRemap: boolean;
}): number {
  if (input.didRemap) {
    return Math.max(input.acousticDurationSec, input.maxUnitEndSec, 1);
  }
  if (input.maxUnitEndSec > TIMED_UNIT_EPSILON_SEC) {
    if (input.prevLogicalSec > 0) {
      return input.prevLogicalSec;
    }
    return Math.max(input.maxUnitEndSec, input.acousticDurationSec, 1);
  }
  if (isDefaultBlankTimelineLogical(input.prevLogicalSec) && input.acousticDurationSec > 0) {
    return input.acousticDurationSec;
  }
  if (input.prevLogicalSec > 0) {
    return input.prevLogicalSec;
  }
  return input.acousticDurationSec > 0
    ? input.acousticDurationSec
    : DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;
}
