import { describe, expect, it } from 'vitest';
import { resolvePairedReadingTargetMenuUnitId } from './transcriptionTimelineVerticalViewHelpers';

describe('resolvePairedReadingTargetMenuUnitId (#455)', () => {
  it('prefers the translation segment id over the source unit id', () => {
    expect(
      resolvePairedReadingTargetMenuUnitId({
        translationSegmentId: 'T-seg',
        contextMenuSourceUnitId: 'S-src',
        sourceUnitIds: ['S-src'],
        primaryUnitId: 'S-src',
      }),
    ).toBe('T-seg');
  });

  it('falls back to the focused source unit when no translation segment id', () => {
    expect(
      resolvePairedReadingTargetMenuUnitId({
        contextMenuSourceUnitId: 'S-2',
        sourceUnitIds: ['S-1', 'S-2'],
        primaryUnitId: 'S-1',
      }),
    ).toBe('S-2');
  });

  it('falls back to primary source when focus is outside the group', () => {
    expect(
      resolvePairedReadingTargetMenuUnitId({
        contextMenuSourceUnitId: 'other',
        sourceUnitIds: ['S-1'],
        primaryUnitId: 'S-1',
      }),
    ).toBe('S-1');
  });
});
