import { describe, expect, it } from 'vitest';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';

describe('computeLogicalTimelineDurationForZoom', () => {
  it('默认 1800s 空白画布在已有语段时改用语段终点，更长的语段仍抬高画布', () => {
    expect(computeLogicalTimelineDurationForZoom(1800, [{ endTime: 5000 }])).toBe(5000);
    expect(computeLogicalTimelineDurationForZoom(1800, [{ endTime: 100 }])).toBe(100);
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

  it('用户写过的文献轴短于声学时保持文献轴', () => {
    expect(
      computeLogicalTimelineDurationForZoom(600, [{ endTime: 100 }], {
        acousticTimelineAnchorSec: 6700,
      }),
    ).toBe(600);
  });

  it('默认空白画布上的语段不因 acoustic anchor 被拉长', () => {
    expect(
      computeLogicalTimelineDurationForZoom(1800, [{ endTime: 100 }], {
        acousticTimelineAnchorSec: 6700,
      }),
    ).toBe(100);
  });

  it('默认 1800s 空白画布在解码后优先用声学秒', () => {
    expect(
      computeLogicalTimelineDurationForZoom(1800, [], { acousticTimelineAnchorSec: 180 }),
    ).toBe(180);
  });
});
