/**
 * ZoomControls.test | 缩放控制组件集成测试
 * @vitest-environment jsdom
 *
 * 重点验证 ZoomControls 组件的事件处理和回调传播
 * Focuses on event handling and callback propagation for ZoomControls component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ZoomControls, { type ZoomControlsProps } from './ZoomControls';

describe('ZoomControls Component', () => {
  const createMockProps = (overrides?: Partial<ZoomControlsProps>): ZoomControlsProps => ({
    zoomPercent: 100,
    snapEnabled: false,
    autoScrollEnabled: true,
    activeUnitId: 'unit-1',

    unitsOnCurrentMedia: [
      { id: 'unit-1', startTime: 0, endTime: 5 },
      { id: 'unit-2', startTime: 5, endTime: 10 },
    ],
    fitPxPerSec: 100,
    maxZoomPercent: 1600,
    onZoomToPercent: vi.fn(),
    onZoomToUnit: vi.fn(),
    onSnapEnabledChange: vi.fn(),
    onAutoScrollEnabledChange: vi.fn(),
    ...overrides,
  });

  it('renders component with all expected DOM elements', () => {
    const { container } = render(<ZoomControls {...createMockProps()} />);

    // Verify key visual elements exist (inside ZoomControls, not parent wrapper)
    expect(container.querySelector('.waveform-zoom-slider')).not.toBeNull();
    expect(container.querySelector('.waveform-zoom-value')).not.toBeNull();
    expect(container.querySelector('.toolbar-sep')).not.toBeNull();
  });

  it('accepts and displays props without errors', () => {
    const onZoomToPercent = vi.fn();
    const onZoomToUnit = vi.fn();
    const onSnapEnabledChange = vi.fn();
    const onAutoScrollEnabledChange = vi.fn();

    const props = createMockProps({
      zoomPercent: 200,
      snapEnabled: true,
      autoScrollEnabled: false,
      onZoomToPercent,
      onZoomToUnit,
      onSnapEnabledChange,
      onAutoScrollEnabledChange,
    });

    const { container } = render(<ZoomControls {...props} />);

    expect(container).not.toBeNull();
    // Just verify component rendered without crashing
    expect(container.querySelector('.icon-btn')).not.toBeNull();
  });

  it('invokes zoom callback when slider changes', () => {
    const onZoomToPercent = vi.fn();
    const { container } = render(<ZoomControls {...createMockProps({ onZoomToPercent })} />);

    const slider = container.querySelector('.waveform-zoom-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '500' } });

    expect(onZoomToPercent).toHaveBeenCalledWith(expect.any(Number), 'custom');
  });

  it('sets 1:1 below fit-all when 100 px/s is coarser than the whole span', () => {
    const onZoomToPercent = vi.fn();
    const { container } = render(
      <ZoomControls {...createMockProps({ fitPxPerSec: 200, onZoomToPercent })} />,
    );
    const label = [...container.querySelectorAll('.icon-btn-label')].find(
      (node) => node.textContent === '1:1',
    );
    fireEvent.click(label?.closest('button') as HTMLButtonElement);
    expect(onZoomToPercent).toHaveBeenCalledWith(50, 'custom');
  });

  it('hides snap and follow-scroll when there is no waveform', () => {
    const { container } = render(
      <ZoomControls {...createMockProps({ showAcousticTools: false })} />,
    );
    const labels = [...container.querySelectorAll('.icon-btn-label')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['1:1']);
  });

  it('hides time density controls when cells are packed by text width', () => {
    const { container } = render(
      <ZoomControls {...createMockProps({ showAcousticTools: false, timeZoom: false })} />,
    );
    expect(container.querySelector('.waveform-zoom-slider')).toBeNull();
    expect(container.querySelector('.waveform-zoom-value')).toBeNull();
    const labels = [...container.querySelectorAll('.icon-btn-label')].map(
      (node) => node.textContent,
    );
    expect(labels).not.toContain('1:1');
    expect(container.querySelectorAll('.icon-btn').length).toBe(2);
  });

  it('has correct button elements for zoom operations', () => {
    const { container } = render(<ZoomControls {...createMockProps()} />);
    const buttons = container.querySelectorAll('.icon-btn');

    // Should have multiple zoom control buttons
    expect(buttons.length).toBeGreaterThan(3); // fit-all, fit-sel, 1:1, ZC, AS + separators
  });
});
