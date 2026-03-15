// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SearchReplaceOverlay } from '../src/components/SearchReplaceOverlay';

describe('SearchReplaceOverlay interaction', () => {
  it('navigates and replaces from UI interactions', async () => {
    const onNavigate = vi.fn();
    const onReplace = vi.fn();
    const onClose = vi.fn();

    render(
      <SearchReplaceOverlay
        items={[
          { utteranceId: 'u1', text: 'hello world' },
          { utteranceId: 'u2', text: 'say hello' },
        ]}
        onNavigate={onNavigate}
        onReplace={onReplace}
        onClose={onClose}
      />,
    );

    const searchInput = screen.getByPlaceholderText('搜索…');
    fireEvent.change(searchInput, { target: { value: 'hello' } });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith('u1');
    });

    fireEvent.click(screen.getByTitle('替换'));

    const replaceInput = screen.getByPlaceholderText('替换为…');
    fireEvent.change(replaceInput, { target: { value: 'hi' } });

    fireEvent.click(screen.getByTitle('替换当前'));

    expect(onReplace).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('预览全部替换'));
    expect(screen.getByText(/将替换/)).toBeTruthy();

    fireEvent.click(screen.getByTitle('确认全部替换'));
    expect(onReplace.mock.calls.length).toBeGreaterThan(1);
  });
});
