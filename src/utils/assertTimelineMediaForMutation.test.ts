import { describe, expect, it, vi } from 'vitest';
import type { MediaItemDocType } from '../db';
import { assertTimelineMediaForMutation, TIMELINE_MEDIA_REQUIRED_I18N_KEY } from './assertTimelineMediaForMutation';

describe('assertTimelineMediaForMutation', () => {
  it('returns true and does not set state when media is present', () => {
    const setSaveState = vi.fn();
    const media = { id: 'm1' } as MediaItemDocType;
    expect(assertTimelineMediaForMutation(media, { locale: 'zh-CN', setSaveState })).toBe(true);
    expect(setSaveState).not.toHaveBeenCalled();
  });

  it('reports validation error and returns false when media is missing', () => {
    const setSaveState = vi.fn();
    expect(assertTimelineMediaForMutation(undefined, { locale: 'zh-CN', setSaveState })).toBe(false);
    expect(setSaveState).toHaveBeenCalledTimes(1);
    const arg = setSaveState.mock.calls[0]![0] as { kind: string; errorMeta?: { i18nKey?: string } };
    expect(arg.kind).toBe('error');
    expect(arg.errorMeta?.i18nKey).toBe(TIMELINE_MEDIA_REQUIRED_I18N_KEY);
  });
});
