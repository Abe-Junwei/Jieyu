// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WaveformHoverTooltip } from './WaveformHoverTooltip';
import type { UtteranceDocType } from '../../db';

function makeUtterance(overrides: Partial<UtteranceDocType> = {}): UtteranceDocType {
  const base: UtteranceDocType = {
    id: 'utt-1',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
    annotationStatus: 'raw',
    ...overrides,
  };
  return base;
}

describe('WaveformHoverTooltip', () => {
  const defaultProps = {
    time: 5,
    x: 100,
    y: 50,
    utterances: [
      makeUtterance({ id: 'utt-1', startTime: 0, endTime: 10 }),
      makeUtterance({ id: 'utt-2', startTime: 10, endTime: 20 }),
      makeUtterance({ id: 'utt-3', startTime: 20, endTime: 30 }),
    ],
    getUtteranceTextForLayer: vi.fn(() => '测试文本'),
    formatTime: vi.fn((seconds: number) => `${seconds.toFixed(1)}s`),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with formatted time', () => {
    const { getByText } = render(<WaveformHoverTooltip {...defaultProps} />);
    expect(getByText('5.0s')).toBeTruthy();
  });

  it('renders with correct position', () => {
    const { container } = render(<WaveformHoverTooltip {...defaultProps} x={200} y={75} />);
    const tooltip = container.querySelector('.waveform-hover-tooltip');
    expect(tooltip).toBeTruthy();
    expect((tooltip as HTMLElement).style.left).toBe('200px');
    expect((tooltip as HTMLElement).style.top).toBe('75px');
  });

  it('shows text preview when hovering over an utterance', () => {
    const props = {
      ...defaultProps,
      time: 5, // falls within utt-1 (0-10s)
      getUtteranceTextForLayer: vi.fn(() => '这是测试文本'),
    };
    const { getByText } = render(<WaveformHoverTooltip {...props} />);
    expect(getByText('这是测试文本')).toBeTruthy();
  });

  it('does not show text preview when no utterance at time', () => {
    const props = {
      ...defaultProps,
      time: 35, // outside all utterances
    };
    const { container } = render(<WaveformHoverTooltip {...props} />);
    const tooltip = container.querySelector('.waveform-hover-tooltip');
    expect(tooltip).toBeTruthy();
    // Only time should be shown, no text preview span
    expect(tooltip?.querySelector('.waveform-hover-tooltip-text')).toBeNull();
  });

  it('truncates long text preview to 28 characters', () => {
    // 30 characters - should be truncated (> 28)
    const longText = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ12'; // 28 chars
    const longerText = longText + '34'; // 30 chars
    const props = {
      ...defaultProps,
      time: 5,
      getUtteranceTextForLayer: vi.fn(() => longerText),
    };
    const { container } = render(<WaveformHoverTooltip {...props} />);
    // Should show truncated text with ellipsis (first 28 chars + …)
    const span = container.querySelector('.waveform-hover-tooltip-text');
    expect(span?.textContent).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ12…');
  });

  it('binary search finds utterance at exact start time', () => {
    const props = {
      ...defaultProps,
      time: 0, // exact start of utt-1
      getUtteranceTextForLayer: vi.fn(() => '起始文本'),
    };
    const { getByText } = render(<WaveformHoverTooltip {...props} />);
    expect(getByText('起始文本')).toBeTruthy();
  });

  it('binary search finds utterance at exact end time', () => {
    const props = {
      ...defaultProps,
      time: 10, // exact end of utt-1, which is start of utt-2
      getUtteranceTextForLayer: vi.fn((utt: UtteranceDocType) => {
        return utt.id === 'utt-2' ? '第二个文本' : '第一个文本';
      }),
    };
    const { getByText } = render(<WaveformHoverTooltip {...props} />);
    // At time 10, utt-2 (10-20) should be found
    expect(getByText('第二个文本')).toBeTruthy();
  });

  it('binary search finds utterance in middle of range', () => {
    const props = {
      ...defaultProps,
      time: 15, // middle of utt-2 (10-20)
      getUtteranceTextForLayer: vi.fn(() => '中间文本'),
    };
    const { getByText } = render(<WaveformHoverTooltip {...props} />);
    expect(getByText('中间文本')).toBeTruthy();
  });

  it('handles empty utterances array', () => {
    const props = {
      ...defaultProps,
      utterances: [],
      time: 5,
    };
    const { container } = render(<WaveformHoverTooltip {...props} />);
    const tooltip = container.querySelector('.waveform-hover-tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip?.querySelector('.waveform-hover-tooltip-text')).toBeNull();
  });

  it('handles single utterance', () => {
    const props = {
      ...defaultProps,
      utterances: [makeUtterance({ id: 'utt-1', startTime: 0, endTime: 60 })],
      time: 30,
      getUtteranceTextForLayer: vi.fn(() => '单文本'),
    };
    const { getByText } = render(<WaveformHoverTooltip {...props} />);
    expect(getByText('单文本')).toBeTruthy();
  });

  it('does not show text preview when getUtteranceTextForLayer returns null', () => {
    const props = {
      ...defaultProps,
      time: 5,
      getUtteranceTextForLayer: vi.fn(() => null),
    };
    const { container } = render(<WaveformHoverTooltip {...props} />);
    expect(container.querySelector('.waveform-hover-tooltip-text')).toBeNull();
  });

  it('does not show text preview when getUtteranceTextForLayer returns undefined', () => {
    const props = {
      ...defaultProps,
      time: 5,
      getUtteranceTextForLayer: vi.fn(() => undefined),
    };
    const { container } = render(<WaveformHoverTooltip {...props} />);
    expect(container.querySelector('.waveform-hover-tooltip-text')).toBeNull();
  });

  it('does not show text preview when getUtteranceTextForLayer returns empty string', () => {
    const props = {
      ...defaultProps,
      time: 5,
      getUtteranceTextForLayer: vi.fn(() => ''),
    };
    const { container } = render(<WaveformHoverTooltip {...props} />);
    expect(container.querySelector('.waveform-hover-tooltip-text')).toBeNull();
  });

  it('calls getUtteranceTextForLayer with correct utterance', () => {
    const getUtteranceTextForLayer = vi.fn(() => '文本');
    const props = {
      ...defaultProps,
      time: 5,
      getUtteranceTextForLayer,
    };
    render(<WaveformHoverTooltip {...props} />);
    expect(getUtteranceTextForLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'utt-1' }),
    );
  });

  it('applies orthography-aware preview dir and style to the text fragment only', () => {
    const { container } = render(
      <WaveformHoverTooltip
        {...defaultProps}
        previewDir="rtl"
        previewStyle={{ direction: 'rtl', unicodeBidi: 'isolate', fontFamily: 'Scheherazade New' }}
      />,
    );

    const tooltip = container.querySelector('.waveform-hover-tooltip');
    const preview = container.querySelector('.waveform-hover-tooltip-text');
    expect(tooltip?.getAttribute('dir')).toBeNull();
    expect(preview?.getAttribute('dir')).toBe('rtl');
    expect((preview as HTMLElement).style.direction).toBe('rtl');
    expect((preview as HTMLElement).style.unicodeBidi).toBe('isolate');
    expect((preview as HTMLElement).style.fontFamily).toContain('Scheherazade New');
  });
});
