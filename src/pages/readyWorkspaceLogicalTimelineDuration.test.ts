import { describe, expect, it } from 'vitest';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';

describe('computeLogicalTimelineDurationForZoom', () => {
  it('metadata 逻辑长与语段最大 end 取较大值', () => {
    expect(computeLogicalTimelineDurationForZoom(1800, [{ endTime: 5000 }])).toBe(5000);
    expect(computeLogicalTimelineDurationForZoom(1800, [{ endTime: 100 }])).toBe(1800);
  });

  it('无 metadata 时用 maxEnd 兜底', () => {
    expect(computeLogicalTimelineDurationForZoom(undefined, [{ endTime: 42 }])).toBe(42);
    expect(computeLogicalTimelineDurationForZoom(undefined, [])).toBe(1800);
  });

  it('空轨无 metadata 时可用解码声学秒替代 1800 回退（绿场铺轨）', () => {
    expect(
      computeLogicalTimelineDurationForZoom(undefined, [], { acousticTimelineAnchorSec: 88 }),
    ).toBe(88);
  });

  it('已有 logicalDurationSec 时不因 acoustic anchor 抬高文献轴', () => {
    expect(
      computeLogicalTimelineDurationForZoom(1800, [{ endTime: 100 }], {
        acousticTimelineAnchorSec: 6700,
      }),
    ).toBe(1800);
  });

  it('默认 1800s 空白画布在解码后优先用声学秒', () => {
    expect(
      computeLogicalTimelineDurationForZoom(1800, [], { acousticTimelineAnchorSec: 180 }),
    ).toBe(180);
  });
});
