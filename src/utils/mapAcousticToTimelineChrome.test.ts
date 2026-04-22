import { describe, expect, it } from 'vitest';
import { mapAcousticToTimelineChrome } from './mapAcousticToTimelineChrome';

describe('mapAcousticToTimelineChrome', () => {
  it('maps text-only pending_decode to pending chrome classes and waveform busy attrs', () => {
    const chrome = mapAcousticToTimelineChrome({
      shell: 'text-only',
      state: 'pending_decode',
    });

    expect(chrome.acousticShellPending).toBe(true);
    expect(chrome.timelineContentClassNames).toEqual([
      'timeline-content-text-only',
      'timeline-content-acoustic-pending',
    ]);
    expect(chrome.waveformAreaAttrs).toEqual({
      ariaBusy: true,
      dataTimelineAcousticShell: 'text-only',
    });
  });

  it('maps playable waveform to no extra shell classes and non-busy attrs', () => {
    const chrome = mapAcousticToTimelineChrome({
      shell: 'waveform',
      state: 'playable',
    });

    expect(chrome.acousticShellPending).toBe(false);
    expect(chrome.timelineContentClassNames).toEqual([]);
    expect(chrome.waveformAreaAttrs).toEqual({
      ariaBusy: undefined,
      dataTimelineAcousticShell: 'waveform',
    });
  });

  it('text-only + no_media：无 pending chrome（与 pending_decode 对照）', () => {
    const chrome = mapAcousticToTimelineChrome({
      shell: 'text-only',
      state: 'no_media',
    });

    expect(chrome.acousticShellPending).toBe(false);
    expect(chrome.timelineContentClassNames).toEqual([]);
    expect(chrome.waveformAreaAttrs.ariaBusy).toBeUndefined();
    expect(chrome.waveformAreaAttrs.dataTimelineAcousticShell).toBe('text-only');
  });
});
