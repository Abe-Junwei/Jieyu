// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineAxisStatusStrip } from './TimelineAxisStatusStrip';

describe('TimelineAxisStatusStrip', () => {
  it('shows link_off for no_playable_media without leaking raw suffix text', () => {
    const { container } = render(
      <TimelineAxisStatusStrip
        locale="zh-CN"
        hint={{ kind: 'no_playable_media', sub: 'no_blob' }}
      />,
    );

    expect(container.querySelector('.timeline-axis-status-strip__icon')?.textContent).toBe('link_off');
    expect(screen.queryByText(/document-placeholder/i)).toBeNull();
  });

  it('shows logical axis length in no_playable_media for document and media timelineMode', () => {
    const { rerender } = render(
      <TimelineAxisStatusStrip
        locale="zh-CN"
        hint={{ kind: 'no_playable_media', sub: 'no_blob' }}
        logicalDurationSec={215.1}
        timelineMode="document"
      />,
    );

    expect(screen.getByText(/逻辑轴长度|Logical axis length/)).toBeTruthy();

    rerender(
      <TimelineAxisStatusStrip
        locale="zh-CN"
        hint={{ kind: 'no_playable_media', sub: 'no_blob' }}
        logicalDurationSec={215.1}
        timelineMode="media"
      />,
    );

    expect(screen.getByText(/逻辑轴长度|Logical axis length/)).toBeTruthy();

    rerender(
      <TimelineAxisStatusStrip
        locale="zh-CN"
        hint={{ kind: 'no_playable_media', sub: 'no_blob' }}
        logicalDurationSec={215.1}
        timelineMode="other"
      />,
    );

    expect(screen.queryByText(/逻辑轴长度|Logical axis length/)).toBeNull();

    rerender(
      <TimelineAxisStatusStrip
        locale="zh-CN"
        hint={{ kind: 'acoustic_decoding' }}
        logicalDurationSec={215.1}
        timelineMode="document"
      />,
    );

    expect(screen.queryByText(/逻辑轴长度|Logical axis length/)).toBeNull();
  });

  it('renders expand action for duration_short when expandLogical is provided', () => {
    const onPress = vi.fn();
    render(
      <TimelineAxisStatusStrip
        locale="en-US"
        hint={{ kind: 'duration_short', acousticSec: 10, maxUnitEndSec: 25 }}
        expandLogical={{ busy: false, onPress }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand logical axis/i }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not render choose-media import button for no_playable_media', () => {
    const { container } = render(
      <TimelineAxisStatusStrip
        locale="en-US"
        hint={{ kind: 'no_playable_media', sub: 'no_blob' }}
      />,
    );
    expect(within(container).queryByRole('button', { name: /Choose media file/i })).toBeNull();
  });
});
