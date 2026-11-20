/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { TimeRulerOverview } from './TimeRulerOverview';

describe('TimeRulerOverview', () => {
  it('seeks from a click and sizes the viewport to the visible span', () => {
    const seekTo = vi.fn();
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <TimeRulerOverview trackSec={2} seekSec={2} viewStart={0.5} viewEnd={1} seekTo={seekTo} />
      </LocaleProvider>,
    );
    const strip = screen.getByTitle('鸟瞰导航：点击或拖动定位');
    strip.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 100,
        top: 0,
        height: 4,
        right: 100,
        bottom: 4,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    fireEvent.click(strip, { clientX: 25 });
    expect(seekTo).toHaveBeenCalledWith(0.5);

    const viewport = container.querySelector('.time-ruler-overview-viewport');
    expect(viewport?.getAttribute('style')).toContain('left: 25%');
    expect(viewport?.getAttribute('style')).toContain('width: 25%');
  });

  it('leaves the track bare when the waveform is showing the whole span', () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <TimeRulerOverview trackSec={2} seekSec={2} viewStart={0} viewEnd={2} seekTo={vi.fn()} />
      </LocaleProvider>,
    );
    expect(container.querySelector('.time-ruler-overview-track')).toBeTruthy();
    expect(container.querySelector('.time-ruler-overview-viewport')).toBeNull();
  });
});
