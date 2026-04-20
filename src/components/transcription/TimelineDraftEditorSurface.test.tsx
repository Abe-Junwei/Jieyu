// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineDraftEditorSurface } from './TimelineDraftEditorSurface';

describe('TimelineDraftEditorSurface', () => {
  it('renders full-width resize handles on the top and bottom edges for multiline editors', () => {
    const view = render(
      <TimelineDraftEditorSurface
        multiline
        inputClassName="test-input"
        value="alpha\nbeta"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
      />,
    );

    expect(within(view.container).getByLabelText('Resize from top edge')).toBeTruthy();
    expect(within(view.container).getByLabelText('Resize from bottom edge')).toBeTruthy();
  });

  it('does not render edge resize handles for single-line editors', () => {
    const view = render(
      <TimelineDraftEditorSurface
        inputClassName="test-input"
        value="alpha"
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );

    expect(within(view.container).queryByLabelText('Resize from top edge')).toBeNull();
    expect(within(view.container).queryByLabelText('Resize from bottom edge')).toBeNull();
  });

  it('forwards edge drag starts to the shared resize chain', () => {
    const onResizeHandlePointerDown = vi.fn();
    const view = render(
      <TimelineDraftEditorSurface
        multiline
        inputClassName="test-input"
        value="alpha\nbeta"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onResizeHandlePointerDown={onResizeHandlePointerDown}
      />,
    );

    fireEvent.pointerDown(within(view.container).getByLabelText('Resize from top edge'), { clientY: 100 });
    fireEvent.pointerDown(within(view.container).getByLabelText('Resize from bottom edge'), { clientY: 112 });

    expect(onResizeHandlePointerDown).toHaveBeenNthCalledWith(1, expect.any(Object), 'top');
    expect(onResizeHandlePointerDown).toHaveBeenNthCalledWith(2, expect.any(Object), 'bottom');
  });
});
