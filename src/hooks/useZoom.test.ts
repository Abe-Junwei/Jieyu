// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { shouldBypassTimelineWheel } from './useZoom';

describe('shouldBypassTimelineWheel', () => {
  it('allows native wheel scrolling inside textarea editors', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    expect(shouldBypassTimelineWheel(textarea)).toBe(true);
  });

  it('allows native wheel scrolling inside explicitly scrollable descendants', () => {
    const scroller = document.createElement('div');
    scroller.setAttribute('data-allow-native-scroll', 'true');
    const child = document.createElement('span');
    scroller.appendChild(child);
    document.body.appendChild(scroller);

    expect(shouldBypassTimelineWheel(child)).toBe(true);
  });

  it('keeps timeline wheel handling for plain non-scrollable surfaces', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    expect(shouldBypassTimelineWheel(div)).toBe(false);
  });
});
