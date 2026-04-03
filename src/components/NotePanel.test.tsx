// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserNoteDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { NotePanel } from './NotePanel';

afterEach(() => {
  cleanup();
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof NotePanel>> = {}) {
  const onClose = vi.fn();
  const onAdd = vi.fn(async () => undefined);
  const onUpdate = vi.fn(async () => undefined);
  const onDelete = vi.fn(async () => undefined);
  const note = {
    id: 'note-1',
    content: { default: '已有备注' },
    category: 'comment',
  } as UserNoteDocType;

  const view = render(
    <LocaleProvider locale="zh-CN">
      <NotePanel
        isOpen
        notes={[note]}
        targetLabel="测试目标"
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onDelete={onDelete}
        {...overrides}
      />
    </LocaleProvider>,
  );

  return { view, onClose, onAdd, onUpdate, onDelete };
}

describe('NotePanel', () => {
  it('does not render when closed', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <NotePanel
          isOpen={false}
          notes={[]}
          targetLabel="测试目标"
          onClose={vi.fn()}
          onAdd={vi.fn(async () => undefined)}
          onUpdate={vi.fn(async () => undefined)}
          onDelete={vi.fn(async () => undefined)}
        />
      </LocaleProvider>,
    );

    expect(screen.queryByText('备注面板 · 测试目标')).toBeNull();
  });

  it('renders panel shell with summary, sections, and header close action', () => {
    const { view } = renderPanel();
    const panel = view.container.querySelector('.note-panel') as HTMLDivElement;
    const closeButton = screen.getByRole('button', { name: '关闭备注面板' });
    const addButton = screen.getByRole('button', { name: '新增备注' });

    expect(panel.className).toContain('dialog-card');
    expect(panel.className).toContain('note-panel');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(addButton.className).toContain('panel-button--primary');
    expect(screen.getAllByText('现有备注').length).toBeGreaterThan(0);
    expect(screen.getAllByText('新增备注').length).toBeGreaterThan(0);
    expect(screen.getByText('已有备注')).toBeTruthy();
  });

  it('adds a note through the composer section', async () => {
    const { onAdd } = renderPanel({ notes: [] });

    fireEvent.change(screen.getByPlaceholderText('输入新备注…（Ctrl+Enter 提交）'), {
      target: { value: '新的面板备注' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'question' } });
    fireEvent.click(screen.getByRole('button', { name: '新增备注' }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({ default: '新的面板备注' }, 'question');
    });
  });
});