// @vitest-environment jsdom
import { useEffect } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithLocale } from '../test/localeTestUtils';
import { PdfViewerPanel } from './PdfViewerPanel';

vi.mock('./PdfViewerRenderer', () => ({
  PdfViewerRenderer: ({
    url,
    currentPage,
    searchSnippet,
    onLoadingChange,
    onErrorChange,
    onTotalPagesChange,
  }: {
    url: string;
    currentPage: number;
    searchSnippet?: string;
    onLoadingChange: (loading: boolean) => void;
    onErrorChange: (error: string | null) => void;
    onTotalPagesChange: (totalPages: number) => void;
  }) => {
    useEffect(() => {
      onLoadingChange(false);
      if (url.includes('error')) {
        onErrorChange('Mock PDF failed');
        return;
      }
      onErrorChange(null);
      onTotalPagesChange(4);
    }, [onErrorChange, onLoadingChange, onTotalPagesChange, url]);

    return (
      <div data-testid="pdf-viewer-renderer">
        {`mock-page:${currentPage}:${searchSnippet ?? 'none'}`}
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
});

describe('PdfViewerPanel', () => {
  it('renders panel summary, toolbar, and snippet-aware renderer shell', async () => {
    const view = renderWithLocale(
      <PdfViewerPanel
        url="/mock.pdf"
        title="项目手册"
        page={1}
        searchSnippet="命中的引用片段"
      />,
    );

    const root = view.container.querySelector('.pnl-pdf-viewer-panel') as HTMLDivElement;
    const navButtons = view.container.querySelectorAll('.pdf-viewer-panel-nav');

    expect(root).toBeTruthy();
    expect(root.querySelector('.dialog-header')).toBeTruthy();
    expect(root.querySelector('.dialog-footer')).toBeTruthy();
    expect(root.querySelector('.pdf-viewer-panel-summary')).toBeTruthy();
    expect(root.querySelector('.pdf-viewer-panel-toolbar')).toBeTruthy();
    expect(root.querySelector('.pdf-viewer-panel-stage')).toBeTruthy();
    expect(screen.getByText('项目手册')).toBeTruthy();
    expect(screen.getByText('命中的引用片段')).toBeTruthy();
    expect(screen.getByText('定位片段')).toBeTruthy();
    expect(navButtons).toHaveLength(2);
    navButtons.forEach((button) => {
      expect(button.className).toContain('panel-button');
    });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-viewer-renderer').textContent).toContain('mock-page:1:命中的引用片段');
      expect(screen.getAllByText('第 1 / 4 页').length).toBeGreaterThan(0);
    });
  });

  it('navigates pages and surfaces renderer errors', async () => {
    renderWithLocale(
      <PdfViewerPanel url="/mock.pdf" page={3} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-viewer-renderer').textContent).toContain('mock-page:3:none');
      expect(screen.getAllByText('第 3 / 4 页').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '上一页' }));

    await waitFor(() => {
      expect(screen.getByTestId('pdf-viewer-renderer').textContent).toContain('mock-page:2:none');
      expect(screen.getAllByText('第 2 / 4 页').length).toBeGreaterThan(0);
    });

    renderWithLocale(
      <PdfViewerPanel url="/error.pdf" page={1} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Mock PDF failed')).toBeTruthy();
    });
  });
});
