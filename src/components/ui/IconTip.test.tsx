/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IconTipButton, IconTipTrigger, resetIconTips } from './IconTip';

function box(top: number): DOMRect {
  return new DOMRect(40, top, 24, 24);
}

describe('IconTip', () => {
  beforeEach(() => {
    resetIconTips();
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(
      this: HTMLElement,
    ) {
      return this.classList.contains('jieyu-icon-tip') ? new DOMRect(100, 60, 80, 28) : box(80);
    });
  });

  afterEach(() => {
    cleanup();
    resetIconTips();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits 400ms on hover, shows at once on focus, and Esc leaves focus on the button', () => {
    render(<IconTipButton label="播放">▶</IconTipButton>);
    const button = screen.getByRole('button', { name: '播放' });
    expect(button.hasAttribute('title')).toBe(false);

    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByText('播放')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tip = screen.getByText('播放');
    expect(tip.className).toBe('jieyu-icon-tip');
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    expect(tip.getAttribute('data-side')).toBe('above');

    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      button.focus();
    });
    expect(screen.getByText('播放')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('播放')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('stays hidden when the pointer clicks the button', () => {
    render(<IconTipButton label="播放">▶</IconTipButton>);
    const button = screen.getByRole('button', { name: '播放' });
    fireEvent.pointerEnter(button);
    fireEvent.pointerDown(button);
    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('播放')).toBeNull();
    fireEvent.pointerLeave(button);
    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('播放')).toBeTruthy();
    fireEvent.pointerDown(button);
    expect(screen.queryByText('播放')).toBeNull();
  });

  it('drops a focused tip after the pointer moves elsewhere', () => {
    render(<IconTipButton label="播放">▶</IconTipButton>);
    const button = screen.getByRole('button', { name: '播放' });
    act(() => {
      button.focus();
    });
    fireEvent.pointerMove(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('播放')).toBeTruthy();
    fireEvent.pointerMove(document.body);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText('播放')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('stays open while the pointer crosses onto the tip, then closes after it leaves', () => {
    render(<IconTipButton label="播放">▶</IconTipButton>);
    const button = screen.getByRole('button', { name: '播放' });
    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const tip = screen.getByText('播放');
    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(screen.getByText('播放')).toBe(tip);
    fireEvent.pointerEnter(tip);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('播放')).toBe(tip);
    fireEvent.pointerLeave(tip);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText('播放')).toBeNull();
  });

  it('opens the next icon immediately and closes the previous one', () => {
    render(
      <>
        <IconTipButton label="甲">a</IconTipButton>
        <IconTipButton label="乙">b</IconTipButton>
      </>,
    );
    const first = screen.getByRole('button', { name: '甲' });
    const second = screen.getByRole('button', { name: '乙' });
    fireEvent.pointerEnter(first);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('甲')).toBeTruthy();
    fireEvent.pointerLeave(first);
    fireEvent.pointerEnter(second);
    expect(screen.queryByText('甲')).toBeNull();
    expect(screen.getByText('乙')).toBeTruthy();
  });

  it('flips below when the button is against the top edge', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(
      this: HTMLElement,
    ) {
      return this.classList.contains('jieyu-icon-tip') ? new DOMRect(100, 28, 80, 28) : box(0);
    });
    render(<IconTipButton label="播放">▶</IconTipButton>);
    act(() => {
      screen.getByRole('button', { name: '播放' }).focus();
    });
    expect(screen.getByText('播放').getAttribute('data-side')).toBe('below');
  });

  it('places the tip on the button when the host has no box', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(
      this: HTMLElement,
    ) {
      if (this.classList.contains('jieyu-icon-tip')) return new DOMRect(100, 60, 80, 28);
      if (this.classList.contains('jieyu-icon-tip-host')) return new DOMRect(0, 0, 0, 0);
      return new DOMRect(200, 120, 24, 24);
    });
    render(<IconTipButton label="播放">▶</IconTipButton>);
    act(() => {
      screen.getByRole('button', { name: '播放' }).focus();
    });
    const tip = screen.getByText('播放');
    expect(tip.style.left).toBe('212px');
    expect(tip.style.top).toBe('120px');
  });

  it('puts a left-rail tip at the button’s bottom-right', () => {
    render(
      <IconTipTrigger label="首页" corner>
        <button type="button" aria-label="首页">
          home
        </button>
      </IconTipTrigger>,
    );
    act(() => {
      screen.getByRole('button', { name: '首页' }).focus();
    });
    const tip = screen.getByText('首页');
    expect(tip.getAttribute('data-side')).toBe('corner');
    expect(tip.style.left).toBe('64px');
    expect(tip.style.top).toBe('104px');
    expect(tip.style.transform).toBe('translate(calc(4px + 0px), calc(4px + 0px))');
  });

  it('shifts a corner tip up when it would leave the window', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(
      this: HTMLElement,
    ) {
      return this.classList.contains('jieyu-icon-tip')
        ? new DOMRect(64, window.innerHeight - 10, 80, 28)
        : box(80);
    });
    render(
      <IconTipTrigger label="设置" corner>
        <button type="button" aria-label="设置">
          gear
        </button>
      </IconTipTrigger>,
    );
    act(() => {
      screen.getByRole('button', { name: '设置' }).focus();
    });
    const delta = window.innerHeight - 8 - (window.innerHeight - 10 + 28);
    expect(screen.getByText('设置').style.transform).toBe(
      `translate(calc(4px + 0px), calc(4px + ${delta}px))`,
    );
  });

  it('leaves Escape to a visible dialog and keeps the tip up', () => {
    render(
      <>
        <IconTipButton label="播放">▶</IconTipButton>
        <div role="dialog" aria-modal="false">
          菜单
        </div>
      </>,
    );
    const button = screen.getByRole('button', { name: '播放' });
    act(() => {
      button.focus();
    });
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    fireEvent.keyDown(button, { key: 'Escape' });
    document.removeEventListener('keydown', seen);
    expect(seen).toHaveBeenCalledOnce();
    expect(screen.getByText('播放')).toBeTruthy();
    expect(document.activeElement).toBe(button);
  });

  it('still closes on Escape when the only dialog is hidden or minimized', () => {
    render(
      <>
        <IconTipButton label="播放">▶</IconTipButton>
        <div role="dialog" hidden>
          藏
        </div>
        <section role="dialog" className="is-minimized">
          聊天
        </section>
      </>,
    );
    const button = screen.getByRole('button', { name: '播放' });
    act(() => {
      button.focus();
    });
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    fireEvent.keyDown(button, { key: 'Escape' });
    document.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
    expect(screen.queryByText('播放')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('does not open a disclosure tip while its menu is open', () => {
    const { rerender } = render(
      <IconTipTrigger label="波形">
        <summary>wave</summary>
      </IconTipTrigger>,
    );
    fireEvent.pointerEnter(screen.getByText('wave'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('波形')).toBeTruthy();
    rerender(
      <IconTipTrigger label="波形" suspended>
        <summary>wave</summary>
      </IconTipTrigger>,
    );
    expect(screen.queryByText('波形')).toBeNull();
    fireEvent.pointerEnter(screen.getByText('wave'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText('波形')).toBeNull();
  });
});
