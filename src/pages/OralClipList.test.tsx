/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetIconTips } from '../components/ui/IconTip';
import { OralClipList } from './OralClipList';

const clips = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('OralClipList', () => {
  afterEach(() => {
    cleanup();
    resetIconTips();
    vi.useRealTimers();
  });

  it('hides the list when one clip is saved', () => {
    const { container } = render(
      <OralClipList locale="zh-CN" clips={[{ id: 'a' }]} currentId="a" onPick={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opens to the right and only changes the current clip', () => {
    const onPick = vi.fn();
    render(<OralClipList locale="zh-CN" clips={clips} currentId="b" onPick={onPick} />);
    const playlist = screen.getByRole('button', { name: '播放清单' });
    expect(playlist.hasAttribute('title')).toBe(false);
    vi.useFakeTimers();
    fireEvent.pointerEnter(playlist);
    expect(screen.queryByText('播放清单')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('播放清单').className).toBe('jieyu-icon-tip');
    vi.useRealTimers();
    expect(playlist.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-list(?!-music)/);
    const dots = playlist.querySelectorAll('svg circle');
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      expect(dot).toHaveAttribute('r', '1.5');
      expect(dot).toHaveAttribute('fill', 'currentColor');
      expect(dot).toHaveAttribute('stroke', 'none');
    }
    fireEvent.click(playlist);
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('第 2 条，还剩 2 条');
    expect(menu.style.left).not.toBe('');
    fireEvent.click(screen.getByRole('menuitem', { name: '第 3 条' }));
    expect(onPick).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
