// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineLaneDraftEditorCell } from './TimelineLaneDraftEditorCell';

afterEach(() => {
  cleanup();
});

describe('TimelineLaneDraftEditorCell', () => {
  it('lets click bubble when bubbleClick is set', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <TimelineLaneDraftEditorCell
          bubbleClick
          inputClassName="test-draft-input"
          value=""
          onChange={() => {}}
          onBlur={() => {}}
        />
      </div>,
    );
    const input = screen.getByRole('textbox');
    fireEvent.click(input);
    expect(parentClick).toHaveBeenCalledTimes(1);
  });

  it('stops pointer propagation and still runs an optional handler', () => {
    const onPointerDown = vi.fn();
    const parentPointerDown = vi.fn();
    render(
      <div onPointerDown={parentPointerDown}>
        <TimelineLaneDraftEditorCell
          inputClassName="test-draft-input"
          value=""
          onChange={() => {}}
          onBlur={() => {}}
          onPointerDown={onPointerDown}
        />
      </div>,
    );
    const input = screen.getByRole('textbox');
    fireEvent.pointerDown(input);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(parentPointerDown).not.toHaveBeenCalled();
  });
});
