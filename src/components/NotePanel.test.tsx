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
    targetType: 'text',
    targetId: 'target-1',
    content: { default: '已有备注' },
    category: 'comment',
    createdAt: '2026-04-04T00:00:00.000Z',
    updatedAt: '2026-04-04T00:00:00.000Z',
  } satisfies UserNoteDocType;

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

  it('renders panel shell with header, composer, and explicit edit action', () => {
    const { view } = renderPanel();
    const panel = view.container.querySelector('.pnl-note-panel') as HTMLDivElement;
    const closeButton = screen.getByRole('button', { name: '关闭备注面板' });
    const addButton = screen.getByRole('button', { name: /新增备注|添加备注|add/i });
    const composerInput = screen.getByRole('textbox', { name: '新备注内容' });
    const categorySelect = screen.getByRole('combobox', { name: '新备注分类' });

    expect(panel.className).toContain('dialog-card');
    expect(panel.className).toContain('pnl-note-panel');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(addButton.className).toContain('panel-button--primary');
    expect(composerInput).toBeTruthy();
    expect(categorySelect).toBeTruthy();
    expect(screen.queryByText('现有备注')).toBeNull();
    expect(screen.getAllByText('新增备注').length).toBeGreaterThan(0);
    expect(screen.getByText('已有备注')).toBeTruthy();
    expect(screen.getByRole('button', { name: '编辑备注' })).toBeTruthy();
  });

  it('adds a note through the composer section', async () => {
    const { onAdd } = renderPanel({ notes: [] });

    fireEvent.change(screen.getByRole('textbox', { name: '新备注内容' }), {
      target: { value: '新的面板备注' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '新备注分类' }), { target: { value: 'question' } });
    fireEvent.click(screen.getByRole('button', { name: /新增备注|添加备注|add/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({ default: '新的面板备注' }, 'question');
    });
  });
});
