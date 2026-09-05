// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppSidePaneProvider,
  useAppSidePaneRegistrationSnapshot,
} from '../contexts/AppSidePaneContext';
import type { LexemeDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { LexiconPage } from './LexiconPage';

const {
  mockListLexemes,
  mockListLexemeTranscriptionJumpTargets,
  mockListAttachments,
  mockAttachFile,
  mockUnlinkAttachment,
  featureFlagState,
} = vi.hoisted(() => ({
  mockListLexemes: vi.fn(),
  mockListLexemeTranscriptionJumpTargets: vi.fn(),
  mockListAttachments: vi.fn(),
  mockAttachFile: vi.fn(),
  mockUnlinkAttachment: vi.fn(),
  featureFlagState: { lexiconAttachmentsEnabled: false },
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    lexemes: {
      list: mockListLexemes,
      listTranscriptionJumpTargets: mockListLexemeTranscriptionJumpTargets,
      listAttachments: mockListAttachments,
      attachFile: mockAttachFile,
      unlinkAttachment: mockUnlinkAttachment,
    },
  },
}));

vi.mock('../ai/config/featureFlags', () => ({
  featureFlags: {
    get lexiconAttachmentsEnabled() {
      return featureFlagState.lexiconAttachmentsEnabled;
    },
  },
}));

function SidePaneSnapshot() {
  const registration = useAppSidePaneRegistrationSnapshot();

  return (
    <>
      <div data-testid="side-pane-title">{registration?.title ?? ''}</div>
      <div data-testid="side-pane-subtitle">{registration?.subtitle ?? ''}</div>
      <div data-testid="side-pane-content">{registration?.content ?? null}</div>
    </>
  );
}

function renderLexiconPage(path = '/lexicon') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/lexicon" element={<LexiconPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LexiconPage', () => {
  beforeEach(() => {
    mockListLexemes.mockReset();
    mockListLexemeTranscriptionJumpTargets.mockReset();
    mockListAttachments.mockReset();
    mockAttachFile.mockReset();
    mockUnlinkAttachment.mockReset();
    featureFlagState.lexiconAttachmentsEnabled = false;
    mockListAttachments.mockResolvedValue([]);
    mockAttachFile.mockResolvedValue({
      linkId: 'll-1',
      assetId: 'la-1',
      kind: 'image',
      mimeType: 'image/png',
      displayName: 'dog.png',
      byteSize: 8,
      blobOmitted: false,
      createdAt: '2026-09-05T00:00:00.000Z',
    });
    mockUnlinkAttachment.mockResolvedValue(undefined);
    mockListLexemes.mockResolvedValue([
      {
        id: 'lex-dog',
        lemma: { default: 'dog' },
        citationForm: 'dog',
        senses: [
          {
            gloss: { eng: 'canine' },
            definition: { eng: 'domesticated canine' },
            category: 'noun',
          },
        ],
        language: 'eng',
        lexemeType: 'word',
        forms: [{ transcription: { default: 'dogs' } }],
        usageCount: 7,
        notes: { zho: '常见家养动物' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
      {
        id: 'lex-run',
        lemma: { default: 'run' },
        senses: [{ gloss: { eng: 'move quickly' } }],
        language: 'eng',
        lexemeType: 'verb',
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
    ] satisfies LexemeDocType[]);
    mockListLexemeTranscriptionJumpTargets.mockResolvedValue([]);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the lexicon workspace, selects the first lexeme, and registers the side pane', async () => {
    renderLexiconPage();

    await waitFor(() => {
      expect(screen.getAllByText('dog').length).toBeGreaterThan(0);
      expect(screen.getByText('domesticated canine')).toBeTruthy();
      expect(screen.getByTestId('side-pane-subtitle').textContent).toBe('dog');
    });

    expect(screen.getByTestId('side-pane-title').textContent).toBe('词典工作台');
    expect(screen.getByTestId('side-pane-content').textContent).toContain('canine');
  });

  it('filters lexemes by search text and updates the current detail selection', async () => {
    renderLexiconPage();

    const searchInput = await screen.findByRole('searchbox', {
      name: '按词元、释义或语言筛选词条',
    });
    fireEvent.change(searchInput, { target: { value: 'move quickly' } });

    await waitFor(() => {
      expect(screen.getAllByText('run').length).toBeGreaterThan(0);
      expect(screen.queryByText('domesticated canine')).toBeNull();
      expect(screen.getAllByText('move quickly').length).toBeGreaterThan(0);
    });
  });

  it('renders lexeme jump targets as transcription deep links', async () => {
    mockListLexemeTranscriptionJumpTargets.mockResolvedValue([
      {
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'layer-1',
        unitId: 'unit-1',
        unitKind: 'unit',
        surfaceHint: 'dog',
        linkUpdatedAt: '2026-04-04T00:00:00.000Z',
      },
      {
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'layer-1',
        unitId: 'seg-1',
        unitKind: 'segment',
        surfaceHint: 'dogs',
        linkUpdatedAt: '2026-04-04T00:00:00.000Z',
      },
    ]);

    renderLexiconPage();

    const unitHit = await screen.findByRole('link', { name: /主句段/ });
    expect(unitHit.getAttribute('href')).toBe(
      '/transcription?textId=text-1&mediaId=media-1&layerId=layer-1&unitId=unit-1',
    );
    const segmentHit = screen.getByRole('link', { name: /子段/ });
    expect(segmentHit.getAttribute('href')).toBe(
      '/transcription?textId=text-1&mediaId=media-1&layerId=layer-1&unitId=seg-1&unitKind=segment',
    );
  });

  it('refreshes detail and hit segments when another lexeme is selected', async () => {
    mockListLexemeTranscriptionJumpTargets.mockImplementation(async (lexemeId: string) => {
      if (lexemeId === 'lex-run') {
        return [
          {
            textId: 'text-run',
            mediaId: 'media-run',
            layerId: 'layer-run',
            unitId: 'unit-run',
            unitKind: 'unit',
            surfaceHint: 'running',
            linkUpdatedAt: '2026-04-04T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    renderLexiconPage();
    await screen.findByText('domesticated canine');

    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(screen.getAllByText('move quickly').length).toBeGreaterThan(0);
      expect(screen.getByRole('link', { name: /running/ }).getAttribute('href')).toBe(
        '/transcription?textId=text-run&mediaId=media-run&layerId=layer-run&unitId=unit-run',
      );
    });
    expect(mockListLexemeTranscriptionJumpTargets).toHaveBeenCalledWith('lex-run');
  });

  it('restores search and selection from sessionStorage', async () => {
    window.sessionStorage.setItem(
      'lexiconListState',
      JSON.stringify({ searchText: 'run', selectedLexemeId: 'lex-run' }),
    );

    renderLexiconPage();

    await waitFor(() => {
      expect(
        screen.getByRole('searchbox').getAttribute('value') ??
          (screen.getByRole('searchbox') as HTMLInputElement).value,
      ).toBe('run');
      expect(screen.getAllByText('move quickly').length).toBeGreaterThan(0);
      expect(screen.queryByText('domesticated canine')).toBeNull();
    });
  });

  it('persists the current list state for a later return', async () => {
    renderLexiconPage();
    await screen.findByText('domesticated canine');
    fireEvent.click(screen.getByRole('button', { name: /run/i }));

    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem('lexiconListState') ?? '{}')).toEqual({
        searchText: '',
        selectedLexemeId: 'lex-run',
      });
    });
  });

  it('shows empty state and quick access when no lexemes exist', async () => {
    mockListLexemes.mockResolvedValue([]);

    renderLexiconPage();

    expect(
      await screen.findByText('当前词典里还没有词条；后续可从导入、标注回链或人工创建补齐。'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: '打开正字法管理器' }).getAttribute('href')).toBe(
      '/assets/orthographies',
    );
  });

  it('hides the attachment section when the flag is off', async () => {
    renderLexiconPage();
    await screen.findByText('domesticated canine');
    expect(screen.queryByTestId('lexicon-attachments')).toBeNull();
    expect(screen.queryByText('词条附件')).toBeNull();
  });

  it('uploads an attachment then readback-lists and removes it when the flag is on', async () => {
    featureFlagState.lexiconAttachmentsEnabled = true;
    const uploaded = {
      linkId: 'll-dog',
      assetId: 'la-dog',
      kind: 'image' as const,
      mimeType: 'image/png',
      displayName: 'dog.png',
      languageCode: 'yue',
      byteSize: 8,
      blobOmitted: false,
      createdAt: '2026-09-05T00:00:00.000Z',
    };
    mockAttachFile.mockImplementation(async () => {
      mockListAttachments.mockResolvedValue([uploaded]);
      return uploaded;
    });
    mockUnlinkAttachment.mockImplementation(async () => {
      mockListAttachments.mockResolvedValue([]);
    });

    renderLexiconPage();
    await screen.findByTestId('lexicon-attachments');
    expect(await screen.findByText('当前词条还没有附件。')).toBeTruthy();

    const file = new File(['png-bytes'], 'dog.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('选择附件文件'), { target: { files: [file] } });

    await waitFor(() => {
      expect(mockAttachFile).toHaveBeenCalled();
      expect(screen.getByText('dog.png')).toBeTruthy();
    });
    expect(mockListAttachments).toHaveBeenCalledWith('lex-dog');

    fireEvent.click(screen.getByRole('button', { name: '移除附件' }));
    await waitFor(() => {
      expect(mockUnlinkAttachment).toHaveBeenCalledWith('ll-dog');
      expect(screen.getByText('当前词条还没有附件。')).toBeTruthy();
    });
  });
});
