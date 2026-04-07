// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfViewerRenderer } from './PdfViewerRenderer';

const { mockLoadPdfJsRuntime } = vi.hoisted(() => ({
  mockLoadPdfJsRuntime: vi.fn(),
}));

vi.mock('../services/PdfJsRuntime', () => ({
  loadPdfJsRuntime: mockLoadPdfJsRuntime,
}));

type MockPdfTextItem = {
  str: string;
  transform: [number, number, number, number, number, number];
  height: number;
};

type MockPdfPage = {
  getViewport: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  getTextContent: ReturnType<typeof vi.fn>;
};

function createMockPdfPage(input: {
  width: number;
  height: number;
  items: MockPdfTextItem[];
}): MockPdfPage {
  return {
    getViewport: vi.fn(() => ({ width: input.width, height: input.height })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
    getTextContent: vi.fn(async () => ({ items: input.items })),
  };
}

function createMockPdfDocument(pages: Record<number, MockPdfPage>) {
  return {
    numPages: Object.keys(pages).length,
    getPage: vi.fn(async (pageNumber: number) => pages[pageNumber]),
  };
}

const mockCanvasContext = {
  canvas: document.createElement('canvas'),
} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvasContext);
});

afterEach(() => {
  cleanup();
  mockLoadPdfJsRuntime.mockReset();
  vi.restoreAllMocks();
});

describe('PdfViewerRenderer', () => {
  it('surfaces runtime loading errors', async () => {
    mockLoadPdfJsRuntime.mockRejectedValue(new Error('runtime unavailable'));

    const onLoadingChange = vi.fn();
    const onErrorChange = vi.fn();
    const onTotalPagesChange = vi.fn();

    render(
      <PdfViewerRenderer
        url="/broken.pdf"
        currentPage={1}
        initialPage={1}
        onLoadingChange={onLoadingChange}
        onErrorChange={onErrorChange}
        onTotalPagesChange={onTotalPagesChange}
      />,
    );

    await waitFor(() => {
      expect(onErrorChange).toHaveBeenCalledWith('runtime unavailable');
    });

    expect(onLoadingChange).toHaveBeenCalledWith(true);
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    expect(onTotalPagesChange).not.toHaveBeenCalled();
  });

  it('renders updated page content when current page changes', async () => {
    const page1 = createMockPdfPage({
      width: 420,
      height: 640,
      items: [
        { str: 'First page line', transform: [1, 0, 0, 1, 12, 24], height: 12 },
      ],
    });
    const page2 = createMockPdfPage({
      width: 520,
      height: 760,
      items: [
        { str: 'Second page line', transform: [1, 0, 0, 1, 16, 32], height: 14 },
      ],
    });
    const doc = createMockPdfDocument({ 1: page1, 2: page2 });

    mockLoadPdfJsRuntime.mockResolvedValue({
      getDocument: vi.fn(() => ({ promise: Promise.resolve(doc) })),
    });

    const onLoadingChange = vi.fn();
    const onErrorChange = vi.fn();
    const onTotalPagesChange = vi.fn();
    const onPageResolved = vi.fn();

    const view = render(
      <PdfViewerRenderer
        url="/sample.pdf"
        currentPage={1}
        initialPage={1}
        onLoadingChange={onLoadingChange}
        onErrorChange={onErrorChange}
        onTotalPagesChange={onTotalPagesChange}
        onPageResolved={onPageResolved}
      />,
    );

    await waitFor(() => {
      expect(onTotalPagesChange).toHaveBeenCalledWith(2);
      expect(onPageResolved).toHaveBeenCalledWith(1);
    });

    view.rerender(
      <PdfViewerRenderer
        url="/sample.pdf"
        currentPage={2}
        initialPage={1}
        onLoadingChange={onLoadingChange}
        onErrorChange={onErrorChange}
        onTotalPagesChange={onTotalPagesChange}
        onPageResolved={onPageResolved}
      />,
    );

    await waitFor(() => {
      expect(doc.getPage).toHaveBeenCalledWith(2);
      expect(view.container.textContent).toContain('Second page line');
    });

    expect(page2.render).toHaveBeenCalledWith(expect.objectContaining({
      canvasContext: mockCanvasContext,
    }));

    const canvas = view.container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(520);
    expect(canvas.height).toBe(760);
  });

  it('resolves to snippet hit page when search snippet matches another page', async () => {
    const page1 = createMockPdfPage({
      width: 400,
      height: 600,
      items: [
        { str: 'No hit here', transform: [1, 0, 0, 1, 10, 20], height: 12 },
      ],
    });
    const page2 = createMockPdfPage({
      width: 400,
      height: 600,
      items: [
        { str: 'Contains target snippet', transform: [1, 0, 0, 1, 10, 20], height: 12 },
      ],
    });
    const page3 = createMockPdfPage({
      width: 400,
      height: 600,
      items: [
        { str: 'Tail page', transform: [1, 0, 0, 1, 10, 20], height: 12 },
      ],
    });
    const doc = createMockPdfDocument({ 1: page1, 2: page2, 3: page3 });

    mockLoadPdfJsRuntime.mockResolvedValue({
      getDocument: vi.fn(() => ({ promise: Promise.resolve(doc) })),
    });

    const onLoadingChange = vi.fn();
    const onErrorChange = vi.fn();
    const onTotalPagesChange = vi.fn();
    const onPageResolved = vi.fn();

    const view = render(
      <PdfViewerRenderer
        url="/snippet.pdf"
        currentPage={1}
        initialPage={1}
        onLoadingChange={onLoadingChange}
        onErrorChange={onErrorChange}
        onTotalPagesChange={onTotalPagesChange}
        onPageResolved={onPageResolved}
      />,
    );

    await waitFor(() => {
      expect(onTotalPagesChange).toHaveBeenCalledWith(3);
    });

    view.rerender(
      <PdfViewerRenderer
        url="/snippet.pdf"
        currentPage={1}
        initialPage={1}
        searchSnippet="target snippet"
        onLoadingChange={onLoadingChange}
        onErrorChange={onErrorChange}
        onTotalPagesChange={onTotalPagesChange}
        onPageResolved={onPageResolved}
      />,
    );

    await waitFor(() => {
      expect(onPageResolved).toHaveBeenCalledWith(2);
    });
  });

  it('applies highlight style to matched text on the rendered page', async () => {
    const page1 = createMockPdfPage({
      width: 420,
      height: 640,
      items: [
        { str: 'Prefix line', transform: [1, 0, 0, 1, 12, 24], height: 12 },
        { str: 'Target snippet here', transform: [1, 0, 0, 1, 12, 44], height: 12 },
      ],
    });
    const doc = createMockPdfDocument({ 1: page1 });

    mockLoadPdfJsRuntime.mockResolvedValue({
      getDocument: vi.fn(() => ({ promise: Promise.resolve(doc) })),
    });

    const view = render(
      <PdfViewerRenderer
        url="/highlight.pdf"
        currentPage={1}
        initialPage={1}
        searchSnippet="target snippet"
        onLoadingChange={vi.fn()}
        onErrorChange={vi.fn()}
        onTotalPagesChange={vi.fn()}
        onPageResolved={vi.fn()}
      />,
    );

    await waitFor(() => {
      const highlightedNode = Array.from(view.container.querySelectorAll('span')).find(
        (node) => node.textContent === 'Target snippet here',
      ) as HTMLSpanElement | undefined;
      expect(highlightedNode).toBeTruthy();
      expect(highlightedNode?.style.backgroundColor).toBe('var(--state-warning-bg)');
      expect(highlightedNode?.style.color).toBe('var(--text-primary)');
    });
  });

  it('clears previous highlight when search snippet is removed', async () => {
    const page1 = createMockPdfPage({
      width: 420,
      height: 640,
      items: [
        { str: 'Target snippet here', transform: [1, 0, 0, 1, 12, 24], height: 12 },
      ],
    });
    const doc = createMockPdfDocument({ 1: page1 });

    mockLoadPdfJsRuntime.mockResolvedValue({
      getDocument: vi.fn(() => ({ promise: Promise.resolve(doc) })),
    });

    const view = render(
      <PdfViewerRenderer
        url="/highlight-clear.pdf"
        currentPage={1}
        initialPage={1}
        searchSnippet="target snippet"
        onLoadingChange={vi.fn()}
        onErrorChange={vi.fn()}
        onTotalPagesChange={vi.fn()}
        onPageResolved={vi.fn()}
      />,
    );

    await waitFor(() => {
      const highlightedNode = Array.from(view.container.querySelectorAll('span')).find(
        (node) => node.textContent === 'Target snippet here',
      ) as HTMLSpanElement | undefined;
      expect(highlightedNode?.style.backgroundColor).toBe('var(--state-warning-bg)');
    });

    view.rerender(
      <PdfViewerRenderer
        url="/highlight-clear.pdf"
        currentPage={1}
        initialPage={1}
        onLoadingChange={vi.fn()}
        onErrorChange={vi.fn()}
        onTotalPagesChange={vi.fn()}
        onPageResolved={vi.fn()}
      />,
    );

    await waitFor(() => {
      const nodeWithoutHighlight = Array.from(view.container.querySelectorAll('span')).find(
        (node) => node.textContent === 'Target snippet here',
      ) as HTMLSpanElement | undefined;
      expect(nodeWithoutHighlight).toBeTruthy();
      expect(nodeWithoutHighlight?.style.backgroundColor).toBe('');
      expect(nodeWithoutHighlight?.style.color).toBe('');
    });
  });
});
