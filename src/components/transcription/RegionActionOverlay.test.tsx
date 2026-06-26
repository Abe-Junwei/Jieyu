// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { RegionActionOverlay } from './RegionActionOverlay';

vi.mock('../../i18n', () => ({
  useLocale: vi.fn(() => 'zh-CN'),
  t: vi.fn((_locale: unknown, key: string) => {
    const translations: Record<string, string> = {
      'transcription.wave.segmentSpeed': '播放速度',
      'transcription.wave.segmentSpeedReset': '重置速度',
      'transcription.wave.segmentSpeedNormal': '正常速度',
      'transcription.wave.loopOn': '开启循环',
      'transcription.wave.loopOff': '关闭循环',
      'transcription.wave.play': '播放',
      'transcription.wave.stop': '停止',
      'transcription.action.skipProcessingMarked': '已标记为跳过处理',
    };
    return translations[key] ?? key;
  }),
  tf: vi.fn((_locale: unknown, key: string, params?: Record<string, string>) => {
    const translations: Record<string, string> = {
      'transcription.wave.segmentSpeed': '播放速度 {rate}',
    };
    let result = translations[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, v);
      });
    }
    return result;
  }),
}));

describe('RegionActionOverlay', () => {
  const defaultProps = {
    unitStartTime: 10,
    unitEndTime: 20,
    viewportFrame: { pxPerDocSec: 50, scrollLeftPx: 0 },
    waveAreaWidth: 800,
    isPlaying: false,
    segmentPlaybackRate: 1,
    segmentLoopPlayback: false,
    skipProcessing: false,
    onPlaybackRateChange: vi.fn(),
    onToggleLoop: vi.fn(),
    onTogglePlay: vi.fn(),
  };

  it('renders overlay within visible area', () => {
    const { container } = render(<RegionActionOverlay {...defaultProps} />);
    expect(container.querySelector('.region-action-overlay')).toBeTruthy();
  });

  it('renders anchored overlay structure with clamped left offset and visible controls', () => {
    const props = {
      ...defaultProps,
      unitStartTime: 1,
      unitEndTime: 12,
      viewportFrame: { pxPerDocSec: 20, scrollLeftPx: 40 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);

    const overlay = container.querySelector('.region-action-overlay') as HTMLDivElement;
    const slider = container.querySelector('.segment-speed-slider') as HTMLInputElement;

    expect(overlay).toBeTruthy();
    expect(overlay.style.left).toBe('0px');
    expect(container.querySelector('.segment-speed-control')).toBeTruthy();
    expect(slider.value).toBe('1');
    expect(within(overlay).getByTitle('播放')).toBeTruthy();
    expect(within(overlay).getByTitle('关闭循环')).toBeTruthy();
    expect(within(overlay).getByTitle(/播放速度 1\.00/)).toBeTruthy();
  });

  it('positions with tier-primary scrollLeftPx (extended-document authority)', () => {
    const props = {
      ...defaultProps,
      unitStartTime: 10,
      unitEndTime: 20,
      viewportFrame: { pxPerDocSec: 50, scrollLeftPx: 200 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    const overlay = container.querySelector('.region-action-overlay') as HTMLDivElement;
    expect(overlay.style.left).toBe('300px');
  });

  it('does not render when region is completely left of visible area', () => {
    const props = {
      ...defaultProps,
      unitStartTime: -100,
      unitEndTime: -50,
      viewportFrame: { pxPerDocSec: 50, scrollLeftPx: 0 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    expect(container.querySelector('.region-action-overlay')).toBeNull();
  });

  it('does not render when region is completely right of visible area', () => {
    const props = {
      ...defaultProps,
      unitStartTime: 1000,
      unitEndTime: 2000,
      viewportFrame: { pxPerDocSec: 50, scrollLeftPx: 0 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    expect(container.querySelector('.region-action-overlay')).toBeNull();
  });

  it('shows speed slider when region width >= 160px', () => {
    const props = {
      ...defaultProps,
      viewportFrame: { pxPerDocSec: 20, scrollLeftPx: 0 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    expect(container.querySelector('.segment-speed-control')).toBeTruthy();
  });

  it('hides speed slider when region width < 160px', () => {
    const props = {
      ...defaultProps,
      viewportFrame: { pxPerDocSec: 10, scrollLeftPx: 0 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    expect(container.querySelector('.segment-speed-control')).toBeNull();
  });

  it('shows loop button when region width >= 72px', () => {
    const props = {
      ...defaultProps,
      viewportFrame: { pxPerDocSec: 10, scrollLeftPx: 0 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    expect(container.querySelector('.region-action-btn')).toBeTruthy();
  });

  it('hides loop button when region width < 72px', () => {
    const props = {
      ...defaultProps,
      unitStartTime: 10,
      unitEndTime: 15,
      viewportFrame: { pxPerDocSec: 10, scrollLeftPx: 0 },
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    const overlay = container.querySelector('.region-action-overlay') as HTMLElement;
    expect(within(overlay).getByTitle('播放')).toBeTruthy();
    expect(within(overlay).queryByTitle('关闭循环')).toBeNull();
  });

  it('calls onToggleLoop when loop button is clicked', () => {
    const onToggleLoop = vi.fn();
    const props = {
      ...defaultProps,
      viewportFrame: { pxPerDocSec: 20, scrollLeftPx: 0 },
      onToggleLoop,
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    const overlay = container.querySelector('.region-action-overlay') as HTMLElement;
    const loopBtn = within(overlay).getByTitle('关闭循环');
    fireEvent.click(loopBtn);
    expect(onToggleLoop).toHaveBeenCalledTimes(1);
  });

  it('calls onTogglePlay when play/stop button is clicked', () => {
    const onTogglePlay = vi.fn();
    const props = {
      ...defaultProps,
      onTogglePlay,
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    const playBtn = container.querySelector('.region-action-btn:last-child');
    fireEvent.click(playBtn!);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('calls onPlaybackRateChange when slider is moved', () => {
    const onPlaybackRateChange = vi.fn();
    const props = {
      ...defaultProps,
      viewportFrame: { pxPerDocSec: 20, scrollLeftPx: 0 },
      onPlaybackRateChange,
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    const slider = container.querySelector('.segment-speed-slider');
    fireEvent.change(slider!, { target: { value: 1.5 } });
    expect(onPlaybackRateChange).toHaveBeenCalledWith(1.5);
  });

  it('renders play icon when not playing', () => {
    const { container } = render(<RegionActionOverlay {...defaultProps} isPlaying={false} />);
    const buttons = container.querySelectorAll('.region-action-btn');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders stop icon when playing', () => {
    const { container } = render(<RegionActionOverlay {...defaultProps} isPlaying={true} />);
    const buttons = container.querySelectorAll('.region-action-btn');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('loop button has active class when segmentLoopPlayback is true', () => {
    const props = {
      ...defaultProps,
      viewportFrame: { pxPerDocSec: 20, scrollLeftPx: 0 },
      segmentLoopPlayback: true,
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    const loopBtn = container.querySelector('.region-action-btn-active');
    expect(loopBtn).toBeTruthy();
  });

  it('handles scroll offset correctly', () => {
    const props = {
      ...defaultProps,
      viewportFrame: { pxPerDocSec: 50, scrollLeftPx: 200 },
      unitStartTime: 10,
      unitEndTime: 20,
    };
    const { container } = render(<RegionActionOverlay {...props} />);
    expect(container.querySelector('.region-action-overlay')).toBeTruthy();
  });

  it('hides the overlay entirely for skipped regions and relies on striped segment styling', () => {
    const { container } = render(<RegionActionOverlay {...defaultProps} skipProcessing />);
    expect(container.querySelector('.region-action-overlay')).toBeNull();
    expect(container.querySelector('.region-status-pill')).toBeNull();
    expect(container.querySelectorAll('.region-action-btn')).toHaveLength(0);
  });
});
