import { describe, expect, it } from 'vitest';
import { buildCollaborationPresenceFocus } from './useTranscriptionDataCollaborationFocus';
import { createTimelineUnit } from './transcriptionTypes';

describe('buildCollaborationPresenceFocus', () => {
  it('returns layer_unit when a segment unit is selected', () => {
    const u = createTimelineUnit('L1', 'u1', 'segment');
    expect(buildCollaborationPresenceFocus(u, 'L1')).toEqual({ entityType: 'layer_unit', entityId: 'u1' });
  });

  it('returns layer when no unit selection but layer id is set', () => {
    expect(buildCollaborationPresenceFocus(null, 'L9')).toEqual({ entityType: 'layer', entityId: 'L9' });
  });

  it('returns empty object when nothing is selected', () => {
    expect(buildCollaborationPresenceFocus(null, '')).toEqual({});
  });
});
