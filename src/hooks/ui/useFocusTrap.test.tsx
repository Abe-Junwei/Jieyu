// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function stubOffsetParent() {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return document.body;
    },
  });
}

function TrapHarness({ onEscape }: { onEscape: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true, onEscape);
  return (
    <div ref={containerRef} role="dialog" aria-label="trap">
      <button type="button">关闭</button>
      <input aria-label="项目主显示名" autoFocus />
    </div>
  );
}

function TypingDialog() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const handleClose = () => undefined;
  useFocusTrap(containerRef, true, handleClose);
  return (
    <div ref={containerRef} role="dialog" aria-label="新建项目">
      <button type="button">关闭</button>
      <input
        aria-label="项目主显示名"
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
    </div>
  );
}

describe('useFocusTrap', () => {
  beforeEach(() => {
    stubOffsetParent();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not move focus to the first control when onEscape identity changes', () => {
    const { rerender } = render(<TrapHarness onEscape={() => undefined} />);
    const titleInput = screen.getByRole('textbox', { name: '项目主显示名' });
    titleInput.focus();
    expect(document.activeElement).toBe(titleInput);

    rerender(<TrapHarness onEscape={() => undefined} />);

    expect(document.activeElement).toBe(titleInput);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '关闭' }));
  });

  it('keeps the title input focused after the first typed character', () => {
    render(<TypingDialog />);
    const titleInput = screen.getByRole('textbox', { name: '项目主显示名' });
    titleInput.focus();

    fireEvent.change(titleInput, { target: { value: '白' } });

    expect(titleInput).toHaveProperty('value', '白');
    expect(document.activeElement).toBe(titleInput);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '关闭' }));
  });

  it('still closes on Escape after the escape handler identity changes', () => {
    const firstEscape = vi.fn();
    const secondEscape = vi.fn();
    const { rerender } = render(<TrapHarness onEscape={firstEscape} />);

    rerender(<TrapHarness onEscape={secondEscape} />);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(firstEscape).not.toHaveBeenCalled();
    expect(secondEscape).toHaveBeenCalledTimes(1);
  });
});
