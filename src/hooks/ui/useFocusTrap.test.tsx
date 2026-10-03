/** @vitest-environment jsdom */
import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function DialogHarness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const onEscape = vi.fn();
  useFocusTrap(containerRef, true, onEscape);
  return (
    <div ref={containerRef}>
      <button type="button">关闭</button>
      <input
        aria-label="项目名"
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
    </div>
  );
}

describe('useFocusTrap', () => {
  it('opens on the text field and stays there after a character rebuilds the close callback', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentElement;
      },
    });
    try {
      render(<DialogHarness />);
      const input = screen.getByRole('textbox', { name: '项目名' });
      const closeButton = screen.getByRole('button', { name: '关闭' });
      expect(document.activeElement).toBe(input);
      fireEvent.change(input, { target: { value: 'a' } });
      expect(document.activeElement).toBe(input);
      expect(document.activeElement).not.toBe(closeButton);
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
    }
  });
});
