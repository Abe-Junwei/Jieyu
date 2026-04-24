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

  it('空轨无 metadata 时可用解码声学秒替代 1800 回退（与导入音频后铺轨一致）', () => {
    expect(computeLogicalTimelineDurationForZoom(undefined, [], { acousticTimelineAnchorSec: 88 })).toBe(88);
  });
});
