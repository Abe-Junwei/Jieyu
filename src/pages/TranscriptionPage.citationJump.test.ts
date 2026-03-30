// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  media_items: {
    get: vi.fn(async () => undefined),
    toArray: vi.fn(async () => []),
  },
  user_notes: {
    get: vi.fn(async () => undefined),
    toArray: vi.fn(async () => []),
  },
  bibliographic_sources: {
    get: vi.fn(async () => undefined),
    toArray: vi.fn(async () => []),
  },
}));

vi.mock('../db', () => ({
  db: mockDb,
}));

import { handleTranscriptionCitationJump } from './TranscriptionPage.citationJump';

describe('handleTranscriptionCitationJump', () => {
  it('opens bibliography source url when pdf citation cannot resolve media item', async () => {
    mockDb.bibliographic_sources.get.mockImplementationOnce(async () => ({
      id: 'bib-1',
      title: 'Field Notes PDF',
      url: 'https://example.com/field-notes.pdf',
      citationKey: 'BIB1',
      createdAt: '2026-03-29T00:00:00.000Z',
    } as any));

    const onOpenPdfPreviewRequest = vi.fn();
    const onSetSidebarError = vi.fn();

    await handleTranscriptionCitationJump({
      locale: 'zh-CN',
      citationType: 'pdf',
      refId: 'bib-1#page=3',
      layerRailRows: [],
      selectedTimelineUtteranceId: null,
      onJumpToEmbeddingMatch: vi.fn(),
      onSetNotePopover: vi.fn(),
      onSetSidebarError,
      onRevealSchemaLayer: vi.fn(),
      onOpenPdfPreviewRequest,
    });

    expect(onOpenPdfPreviewRequest).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Field Notes PDF',
      page: 3,
      sourceUrl: 'https://example.com/field-notes.pdf',
    }));
    expect(onSetSidebarError).not.toHaveBeenCalled();
  });

  it('shows bibliography guidance when pdf citation target cannot be resolved', async () => {
    mockDb.media_items.get.mockResolvedValueOnce(undefined);
    mockDb.media_items.toArray.mockResolvedValueOnce([]);
    mockDb.bibliographic_sources.get.mockResolvedValueOnce(undefined);
    mockDb.bibliographic_sources.toArray.mockResolvedValueOnce([]);
    mockDb.user_notes.get.mockResolvedValueOnce(undefined);
    mockDb.user_notes.toArray.mockResolvedValueOnce([]);

    const onSetSidebarError = vi.fn();

    await handleTranscriptionCitationJump({
      locale: 'zh-CN',
      citationType: 'pdf',
      refId: 'missing-pdf-ref',
      layerRailRows: [],
      selectedTimelineUtteranceId: null,
      onJumpToEmbeddingMatch: vi.fn(),
      onSetNotePopover: vi.fn(),
      onSetSidebarError,
      onRevealSchemaLayer: vi.fn(),
      onOpenPdfPreviewRequest: vi.fn(),
    });

    expect(onSetSidebarError).toHaveBeenCalledWith(expect.stringContaining('文献管理'));
  });
});