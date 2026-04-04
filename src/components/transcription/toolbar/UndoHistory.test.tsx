// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithLocale } from '../../../test/localeTestUtils';
import UndoHistory from './UndoHistory';

afterEach(() => {
  cleanup();
});

describe('UndoHistory', () => {
  it('does not render when undo and redo are both unavailable', () => {
    const { container } = renderWithLocale(
      <UndoHistory
        canUndo={false}
        canRedo={false}
        undoLabel=""
        undoHistory={[]}
        isHistoryVisible={false}
        onToggleHistoryVisible={vi.fn()}
        onJumpToHistoryIndex={vi.fn()}
        onRedo={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders undo chip and toggles history visibility with updater callback', () => {
    const onToggleHistoryVisible = vi.fn();
    const view = renderWithLocale(
      <UndoHistory
        canUndo
        canRedo={false}
        undoLabel="删除句段"
        undoHistory={[]}
        isHistoryVisible={false}
        onToggleHistoryVisible={onToggleHistoryVisible}
        onJumpToHistoryIndex={vi.fn()}
        onRedo={vi.fn()}
      />,
    );

    const chip = screen.getByRole('button', { name: '撤销: 删除句段' });

    expect(chip.className).toContain('transcription-undo-chip');
    expect(view.container.querySelector('.transcription-undo-chip-label')?.textContent).toContain('撤销: 删除句段');

    fireEvent.click(chip);

    expect(onToggleHistoryVisible).toHaveBeenCalledTimes(1);
    const updater = onToggleHistoryVisible.mock.calls[0]?.[0] as (visible: boolean) => boolean;
    expect(typeof updater).toBe('function');
    expect(updater(false)).toBe(true);
  });

  it('renders history list, jumps to steps, and handles redo action', () => {
    const onToggleHistoryVisible = vi.fn();
    const onJumpToHistoryIndex = vi.fn();
    const onRedo = vi.fn();
    const view = renderWithLocale(
      <UndoHistory
        canUndo
        canRedo
        undoLabel="删除句段"
        undoHistory={['删除句段', '修改译文']}
        isHistoryVisible
        onToggleHistoryVisible={onToggleHistoryVisible}
        onJumpToHistoryIndex={onJumpToHistoryIndex}
        onRedo={onRedo}
      />,
    );

    const panel = view.container.querySelector('.transcription-undo-history') as HTMLDivElement;

    expect(panel).toBeTruthy();
    expect(screen.getByText('编辑历史（最近 15 条）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1. 删除句段' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2. 修改译文' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2. 修改译文' }));

    expect(onJumpToHistoryIndex).toHaveBeenCalledWith(1);
    expect(onToggleHistoryVisible).toHaveBeenCalledWith(false);

    const redoButtons = screen.getAllByRole('button', { name: '重做' });
    fireEvent.click(redoButtons[redoButtons.length - 1] as HTMLButtonElement);

    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
