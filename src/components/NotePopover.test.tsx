// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserNoteDocType } from '../db';
import { NotePopover } from './NotePopover';

afterEach(() => {
  cleanup();
});

describe('NotePopover', () => {
  it('closes popover after adding a note with add button', async () => {
    const onClose = vi.fn();
    const onAdd = vi.fn(async () => undefined);

    render(
      <NotePopover
        x={120}
        y={80}
        notes={[] as UserNoteDocType[]}
        targetLabel="测试目标"
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/输入新备注|添加备注/u), {
      target: { value: '新备注' },
    });

    fireEvent.click(screen.getByRole('button', { name: /添加/ }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({ default: '新备注' }, 'comment');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
