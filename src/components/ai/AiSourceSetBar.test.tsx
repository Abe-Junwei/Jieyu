// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiSourceSetBar } from './AiSourceSetBar';
import type { SavedCorpusSourceSet } from '../../ai/vertical/corpusSourceSet';

afterEach(() => {
  cleanup();
});

function makeSet(overrides: Partial<SavedCorpusSourceSet> = {}): SavedCorpusSourceSet {
  return {
    id: 'set_001',
    name: 'Test Set',
    scope: 'selection',
    members: [
      { id: 'seg_1', type: 'segment', label: 'Segment A' },
      { id: 'seg_2', type: 'segment' },
    ],
    status: 'active',
    createdAt: '2026-05-06T12:00:00.000Z',
    updatedAt: '2026-05-06T12:00:00.000Z',
    ...overrides,
  };
}

describe('AiSourceSetBar', () => {
  it('renders empty state when no sets', () => {
    const onCreate = vi.fn();
    const view = render(
      <AiSourceSetBar
        sourceSets={[]}
        activeSourceSetId={null}
        locale="en-US"
        onCreateSourceSet={onCreate}
      />,
    );

    expect(screen.getByText('Project Scope')).toBeTruthy();
    const addBtn = view.container.querySelector('.ai-source-set-bar__action') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
  });

  it('renders active set name and member count', () => {
    render(
      <AiSourceSetBar
        sourceSets={[makeSet()]}
        activeSourceSetId="set_001"
        locale="en-US"
      />,
    );

    expect(screen.getByText('Test Set')).toBeTruthy();
    expect(screen.getByText(/selection · 2/)).toBeTruthy();
  });

  it('excludes invalidated sets from dropdown', () => {
    const onSelect = vi.fn();
    render(
      <AiSourceSetBar
        sourceSets={[
          makeSet({ id: 'a', name: 'Active' }),
          makeSet({ id: 'b', name: 'Invalidated', status: 'invalidated' }),
        ]}
        activeSourceSetId="a"
        locale="en-US"
        onSelectSourceSet={onSelect}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select.textContent).toContain('Active');
    expect(select.textContent).not.toContain('Invalidated');
  });

  it('expands and collapses member list', () => {
    render(
      <AiSourceSetBar
        sourceSets={[makeSet()]}
        activeSourceSetId="set_001"
        locale="en-US"
        onRemoveMember={vi.fn()}
      />,
    );

    const toggleBtn = screen.getByTitle('Show members');
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Segment A')).toBeTruthy();
    expect(screen.getByText('seg_2')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Hide members'));
    expect(screen.queryByText('Segment A')).toBeNull();
  });

  it('removes a member when × clicked', () => {
    const onRemove = vi.fn();
    render(
      <AiSourceSetBar
        sourceSets={[makeSet()]}
        activeSourceSetId="set_001"
        locale="en-US"
        onRemoveMember={onRemove}
        onAddMember={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('Show members'));
    const removeBtns = screen.getAllByTitle('Remove member');
    expect(removeBtns.length).toBe(2);

    fireEvent.click(removeBtns[0]!);
    expect(onRemove).toHaveBeenCalledWith('set_001', 'seg_1');
  });

  it('adds a member via input + type select + add button', () => {
    const onAdd = vi.fn();
    const view = render(
      <AiSourceSetBar
        sourceSets={[makeSet({ members: [] })]}
        activeSourceSetId="set_001"
        locale="en-US"
        onAddMember={onAdd}
        onRemoveMember={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('Show members'));

    const input = screen.getByPlaceholderText('Member ID');
    fireEvent.change(input, { target: { value: 'new_seg' } });

    const typeSelect = view.container.querySelector('.ai-source-set-bar__member-type-select') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'document' } });

    const addBtn = view.container.querySelector('.ai-source-set-bar__member-add-btn') as HTMLButtonElement;
    fireEvent.click(addBtn);

    expect(onAdd).toHaveBeenCalledWith('set_001', { id: 'new_seg', type: 'document' });
  });

  it('adds a member on Enter key in input', () => {
    const onAdd = vi.fn();
    render(
      <AiSourceSetBar
        sourceSets={[makeSet({ members: [] })]}
        activeSourceSetId="set_001"
        locale="en-US"
        onAddMember={onAdd}
        onRemoveMember={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('Show members'));

    const input = screen.getByPlaceholderText('Member ID');
    fireEvent.change(input, { target: { value: 'enter_seg' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAdd).toHaveBeenCalledWith('set_001', { id: 'enter_seg', type: 'segment' });
  });

  it('disables add button when input is empty', () => {
    const view = render(
      <AiSourceSetBar
        sourceSets={[makeSet({ members: [] })]}
        activeSourceSetId="set_001"
        locale="en-US"
        onAddMember={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('Show members'));
    const addBtn = view.container.querySelector('.ai-source-set-bar__member-add-btn') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it('fires onSelectSourceSet when dropdown changes', () => {
    const onSelect = vi.fn();
    render(
      <AiSourceSetBar
        sourceSets={[makeSet({ id: 'a' }), makeSet({ id: 'b', name: 'Other' })]}
        activeSourceSetId="a"
        locale="en-US"
        onSelectSourceSet={onSelect}
      />,
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'b' } });
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('fires onCreateSourceSet when + button clicked', () => {
    const onCreate = vi.fn();
    const view = render(
      <AiSourceSetBar
        sourceSets={[]}
        activeSourceSetId={null}
        locale="en-US"
        onCreateSourceSet={onCreate}
      />,
    );

    const addBtn = view.container.querySelector('.ai-source-set-bar__action') as HTMLButtonElement;
    fireEvent.click(addBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
