/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OralClipList } from './OralClipList';

const clips = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('OralClipList', () => {
  afterEach(() => cleanup());

  it('hides the list when one clip is saved', () => {
    const { container } = render(
      <OralClipList locale="zh-CN" clips={[{ id: 'a' }]} currentId="a" onPick={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opens to the right and only changes the current clip', () => {
    const onPick = vi.fn();
    render(<OralClipList locale="zh-CN" clips={clips} currentId="b" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: '播放清单' }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('第 2 条，还剩 2 条');
    expect(menu.style.left).not.toBe('');
    fireEvent.click(screen.getByRole('menuitem', { name: '第 3 条' }));
    expect(onPick).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
