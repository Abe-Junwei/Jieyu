import type { TimelineAxisMediaHint } from './timelineAxisStatus';

/** 语段超出声学可播时，扩展逻辑轴应抬升到的目标秒数。 */
export function resolveExpandLogicalTargetSec(hint: TimelineAxisMediaHint): number | null {
  if (hint.kind === 'duration_short') {
    return hint.maxUnitEndSec;
  }
  return null;
}

export function hintSupportsExpandLogical(hint: TimelineAxisMediaHint): boolean {
  return resolveExpandLogicalTargetSec(hint) !== null;
}
