import { describe, expect, it } from 'vitest';
import { formatRecentActions, pushTimelineEditToRing } from './useEditEventBuffer';

describe('pushTimelineEditToRing', () => {
  it('prepends events and caps capacity', () => {
    let ring = pushTimelineEditToRing([], { action: 'delete', unitId: 'a', unitKind: 'segment' }, 3);
    ring = pushTimelineEditToRing(ring, { action: 'split', unitId: 'b', unitKind: 'unit' }, 3);
    ring = pushTimelineEditToRing(ring, { action: 'merge', unitId: 'c', unitKind: 'segment' }, 3);
    ring = pushTimelineEditToRing(ring, { action: 'create', unitId: 'd', unitKind: 'segment' }, 3);
    expect(ring).toHaveLength(3);
    expect(ring[0]?.unitId).toBe('d');
    expect(ring[1]?.unitId).toBe('c');
    expect(ring[2]?.unitId).toBe('b');
  });
});

describe('formatRecentActions', () => {
  it('serializes structured events for prompt injection', () => {
    const lines = formatRecentActions([
      { action: 'assign_speaker', unitId: 's1', unitKind: 'segment', timestamp: 1, detail: 'speakerId=x' },
    ]);
    expect(lines[0]).toContain('assign_speaker:segment:s1');
    expect(lines[0]).toContain('speakerId=x');
  });
});
