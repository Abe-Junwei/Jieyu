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
import { dispatchWorkspaceUnitUpdated } from '../utils/workspaceEvents';

const {
  mockListLexemes,
  mockSaveLexeme,
  mockDeleteLexeme,
  mockListLexemeTranscriptionJumpTargets,
  mockListAttachments,
  mockAttachFile,
  mockUnlinkAttachment,
  featureFlagState,
} = vi.hoisted(() => ({
  mockListLexemes: vi.fn(),
  mockSaveLexeme: vi.fn(),
  mockDeleteLexeme: vi.fn(),
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
      save: mockSaveLexeme,
      delete: mockDeleteLexeme,
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
            <div className="app-main" data-testid="lexicon-scroll-root">
              <Routes>
                <Route path="/lexicon" element={<LexiconPage />} />
              </Routes>
            </div>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LexiconPage', () => {
  beforeEach(() => {
    mockListLexemes.mockReset();
    mockSaveLexeme.mockReset();
    mockDeleteLexeme.mockReset();
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
    mockSaveLexeme.mockImplementation(async (doc: LexemeDocType) => {
      const current = (await mockListLexemes()) as LexemeDocType[];
      const next = current.some((row) => row.id === doc.id)
        ? current.map((row) => (row.id === doc.id ? doc : row))
        : [...current, doc];
      mockListLexemes.mockResolvedValue(next);
      return doc.id;
    });
    mockDeleteLexeme.mockImplementation(async (lexemeId: string) => {
      const current = (await mockListLexemes()) as LexemeDocType[];
      mockListLexemes.mockResolvedValue(current.filter((row) => row.id !== lexemeId));
    });
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
    expect(screen.getByTestId('lexicon-entry-create')).toBeTruthy();
    expect(screen.getByTestId('lexicon-lift-export')).toBeTruthy();
    expect(screen.getByTestId('lexicon-lift-import')).toBeTruthy();
    expect((screen.getByTestId('lexicon-lift-export') as HTMLButtonElement).disabled).toBe(false);
  });

  it('places the edit form above the read-only hit-segment panel', async () => {
    renderLexiconPage();
    const form = await screen.findByTestId('lexicon-entry-edit');
    const hits = screen.getByText('转写命中');
    expect(form.compareDocumentPosition(hits) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
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
      '/transcription?textId=text-1&mediaId=media-1&layerId=layer-1&unitId=unit-1&lexiconReturn=lex-dog',
    );
    const segmentHit = screen.getByRole('link', { name: /子段/ });
    expect(segmentHit.getAttribute('href')).toBe(
      '/transcription?textId=text-1&mediaId=media-1&layerId=layer-1&unitId=seg-1&unitKind=segment&lexiconReturn=lex-dog',
    );
  });

  it('refetches jump targets when a listed unit is updated', async () => {
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
    ]);
    renderLexiconPage();
    await screen.findByRole('link', { name: /主句段/ });
    const reads = mockListLexemeTranscriptionJumpTargets.mock.calls.length;
    mockListLexemeTranscriptionJumpTargets.mockResolvedValue([
      {
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'layer-1',
        unitId: 'unit-1',
        unitKind: 'unit',
        surfaceHint: 'updated-dog',
        linkUpdatedAt: '2026-09-10T00:00:00.000Z',
      },
    ]);
    dispatchWorkspaceUnitUpdated({ unitId: 'unit-1', revision: 31 });
    await waitFor(() => {
      expect(mockListLexemeTranscriptionJumpTargets.mock.calls.length).toBeGreaterThan(reads);
      expect(screen.getByRole('link', { name: /updated-dog/ })).toBeTruthy();
    });
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
        '/transcription?textId=text-run&mediaId=media-run&layerId=layer-run&unitId=unit-run&lexiconReturn=lex-run',
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

  it('persists and restores list scroll from sessionStorage without writing the URL', async () => {
    window.sessionStorage.setItem(
      'lexiconListState',
      JSON.stringify({ searchText: '', selectedLexemeId: 'lex-dog', listScrollTop: 144 }),
    );
    renderLexiconPage();
    await screen.findByText('domesticated canine');
    const scroller = screen.getByTestId('lexicon-scroll-root');
    await waitFor(() => {
      expect(scroller.scrollTop).toBe(144);
    });

    scroller.scrollTop = 88;
    fireEvent.scroll(scroller);
    expect(JSON.parse(window.sessionStorage.getItem('lexiconListState') ?? '{}')).toMatchObject({
      selectedLexemeId: 'lex-dog',
      listScrollTop: 88,
    });
    expect(window.location.search).not.toContain('listScrollTop');
    expect(window.location.search).not.toContain('lexiconListState');
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
    expect((screen.getByTestId('lexicon-lift-export') as HTMLButtonElement).disabled).toBe(true);
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

  it('saves an edited lemma and gloss then readback-lists the new values', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    expect((screen.getByTestId('lexicon-entry-lemma') as HTMLInputElement).value).toBe('dog');
    fireEvent.change(screen.getByTestId('lexicon-entry-lemma'), { target: { value: 'hound' } });
    fireEvent.change(screen.getByTestId('lexicon-entry-gloss'), {
      target: { value: 'hunting dog' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));

    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.lemma.default).toBe('hound');
    expect(saved.senses[0]?.gloss.eng).toBe('hunting dog');
    await waitFor(() => {
      expect(screen.getByTestId('lexicon-workspace-list').textContent).toContain('hound');
      expect(screen.getByTestId('side-pane-subtitle').textContent).toBe('hound');
      expect(screen.getAllByText('hunting dog').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('已保存')).toBeTruthy();
    expect(JSON.parse(window.sessionStorage.getItem('lexiconListState') ?? '{}')).toMatchObject({
      selectedLexemeId: 'lex-dog',
    });
  });

  it('creates a new entry then selects it from list readback', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-create');
    fireEvent.click(screen.getByTestId('lexicon-entry-create'));
    fireEvent.change(screen.getByTestId('lexicon-entry-lemma'), { target: { value: 'cat' } });
    fireEvent.change(screen.getByTestId('lexicon-entry-gloss'), { target: { value: 'feline' } });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));

    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
      expect(screen.getAllByText('cat').length).toBeGreaterThan(0);
      expect(screen.getAllByText('feline').length).toBeGreaterThan(0);
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.lemma.default).toBe('cat');
    expect(saved.senses[0]?.gloss.default).toBe('feline');
    expect(JSON.parse(window.sessionStorage.getItem('lexiconListState') ?? '{}')).toMatchObject({
      selectedLexemeId: saved.id,
    });
  });

  it('keeps a newly created entry selected after clearing an active search', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-create');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dog' } });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /run/i })).toBeNull();
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-create'));
    fireEvent.change(screen.getByTestId('lexicon-entry-lemma'), { target: { value: 'cat' } });
    fireEvent.change(screen.getByTestId('lexicon-entry-gloss'), { target: { value: 'feline' } });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));

    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
      const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
      expect(
        JSON.parse(window.sessionStorage.getItem('lexiconListState') ?? '{}').selectedLexemeId,
      ).toBe(saved.id);
      expect((screen.getByTestId('lexicon-entry-lemma') as HTMLInputElement).value).toBe('cat');
    });
  });

  it('does not write when the lemma is empty', async () => {
    renderLexiconPage();
    fireEvent.click(await screen.findByTestId('lexicon-entry-create'));
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(screen.getByText('词元不能为空。')).toBeTruthy();
    });
    expect(mockSaveLexeme).not.toHaveBeenCalled();
  });

  it('saves an extra sense and wordform then shows them in the detail lists', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    expect((screen.getByTestId('lexicon-entry-lemma') as HTMLInputElement).value).toBe('dog');
    fireEvent.click(screen.getByTestId('lexicon-entry-add-sense'));
    fireEvent.change(await screen.findByTestId('lexicon-entry-extra-sense-0-gloss'), {
      target: { value: 'pet' },
    });
    fireEvent.change(screen.getByTestId('lexicon-entry-extra-sense-0-definition'), {
      target: { value: 'companion animal' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-add-form'));
    fireEvent.change(screen.getByTestId('lexicon-entry-form-1'), { target: { value: 'doggie' } });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
      expect(screen.getByText('pet')).toBeTruthy();
      expect(screen.getByText('companion animal')).toBeTruthy();
      expect(screen.getByText('doggie')).toBeTruthy();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses[1]?.gloss.default).toBe('pet');
    expect(saved.forms?.map((form) => form.transcription.default)).toEqual(['dogs', 'doggie']);
  });

  it('saves a part of speech on the primary sense and an extra sense', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    expect((screen.getByTestId('lexicon-entry-lemma') as HTMLInputElement).value).toBe('dog');
    fireEvent.change(screen.getByTestId('lexicon-entry-category'), { target: { value: 'noun' } });
    fireEvent.click(screen.getByTestId('lexicon-entry-add-sense'));
    fireEvent.change(await screen.findByTestId('lexicon-entry-extra-sense-0-gloss'), {
      target: { value: 'pet' },
    });
    fireEvent.change(screen.getByTestId('lexicon-entry-extra-sense-0-category'), {
      target: { value: 'verb' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses[0]?.category).toBe('noun');
    expect(saved.senses[1]?.category).toBe('verb');
    expect(screen.getByTestId('lexicon-workspace-sense-0-category').textContent).toBe('noun');
    expect(screen.getByTestId('lexicon-workspace-sense-1-category').textContent).toBe('verb');
  });

  it('saves a sense example and shows it in the sense list', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.click(screen.getByTestId('lexicon-entry-add-example'));
    fireEvent.change(screen.getByTestId('lexicon-entry-example-0-source'), {
      target: { value: 'the dog runs' },
    });
    fireEvent.change(screen.getByTestId('lexicon-entry-example-0-translation'), {
      target: { value: '狗在跑' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses[0]?.examples).toEqual([{ source: 'the dog runs', translation: '狗在跑' }]);
    expect(screen.getByTestId('lexicon-workspace-sense-0-example-0').textContent).toBe(
      'the dog runs / 狗在跑',
    );
  });

  it('saves an edited lexeme type and shows it in the overview', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    const input = screen.getByTestId('lexicon-entry-lexeme-type') as HTMLInputElement;
    expect(input.value).toBe('word');
    fireEvent.change(input, { target: { value: 'stem' } });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.lexemeType).toBe('stem');
    expect(screen.getByTestId('lexicon-workspace-lexeme-type').textContent).toBe('stem');
  });

  it('saves a pronunciation and shows it in the overview', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.change(screen.getByTestId('lexicon-entry-pronunciation'), {
      target: { value: 'dɔg' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.pronunciation).toBe('dɔg');
    expect(screen.getByTestId('lexicon-workspace-pronunciation').textContent).toBe('dɔg');
  });

  it('saves an etymology and shows it in the overview', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.change(screen.getByTestId('lexicon-entry-etymology-form'), {
      target: { value: 'perro' },
    });
    fireEvent.change(screen.getByTestId('lexicon-entry-etymology-gloss'), {
      target: { value: 'dog' },
    });
    fireEvent.change(screen.getByTestId('lexicon-entry-etymology-source'), {
      target: { value: 'Spanish' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.etymology).toEqual({ form: 'perro', gloss: 'dog', sourceLanguage: 'Spanish' });
    expect(screen.getByTestId('lexicon-workspace-etymology').textContent).toBe(
      'perro · dog · Spanish',
    );
  });

  it('saves a literal meaning and shows it in the overview', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.change(screen.getByTestId('lexicon-entry-literal-meaning'), {
      target: { value: 'domestic animal' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.literalMeaning).toBe('domestic animal');
    expect(screen.getByTestId('lexicon-workspace-literal-meaning').textContent).toBe(
      'domestic animal',
    );
  });

  it('saves a bibliography and shows it in the overview', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.change(screen.getByTestId('lexicon-entry-bibliography'), {
      target: { value: 'Smith 1990' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.bibliography).toBe('Smith 1990');
    expect(screen.getByTestId('lexicon-workspace-bibliography').textContent).toBe('Smith 1990');
  });

  it('saves restrictions and shows them in the overview', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.change(screen.getByTestId('lexicon-entry-restrictions'), {
      target: { value: 'internal' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.restrictions).toBe('internal');
    expect(screen.getByTestId('lexicon-workspace-restrictions').textContent).toBe('internal');
  });

  it('saves a summary definition and shows it in the overview', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.change(screen.getByTestId('lexicon-entry-summary-definition'), {
      target: { value: 'a canine kept at home' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.summaryDefinition).toBe('a canine kept at home');
    expect(screen.getByTestId('lexicon-workspace-summary-definition').textContent).toBe(
      'a canine kept at home',
    );
  });

  it('saves a scientific name and shows it on the primary sense', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    fireEvent.change(screen.getByTestId('lexicon-entry-scientific-name'), {
      target: { value: 'Canis familiaris' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(screen.getByTestId('lexicon-workspace-sense-0-scientific-name').textContent).toBe(
      'Canis familiaris',
    );
  });

  it('saves a subsense under the primary gloss with parentId', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    expect((screen.getByTestId('lexicon-entry-lemma') as HTMLInputElement).value).toBe('dog');
    fireEvent.click(screen.getByTestId('lexicon-entry-add-subsense-primary'));
    fireEvent.change(await screen.findByTestId('lexicon-entry-extra-sense-0-gloss'), {
      target: { value: 'canid' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses[1]?.gloss.default).toBe('canid');
    expect(saved.senses[1]?.parentId).toBe(saved.senses[0]?.id);
    expect(screen.getByTestId('lexicon-workspace-sense-1').getAttribute('data-depth')).toBe('1');
  });

  it('moves a sibling extra sense down and saves that order', async () => {
    mockListLexemes.mockResolvedValue([
      {
        id: 'lex-dog',
        lemma: { default: 'dog' },
        senses: [
          { id: 'sense_primary', gloss: { default: 'canine' } },
          { id: 'sense_pet', gloss: { default: 'pet' } },
          { id: 'sense_hound', gloss: { default: 'hound' } },
        ],
        language: 'eng',
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ] satisfies LexemeDocType[]);
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    expect((screen.getByTestId('lexicon-entry-lemma') as HTMLInputElement).value).toBe('dog');
    expect(
      (screen.getByTestId('lexicon-entry-move-sense-up-0') as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByTestId('lexicon-entry-move-sense-down-0'));
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses.map((sense) => sense.gloss.default)).toEqual(['canine', 'hound', 'pet']);
  });

  it('demotes the second subsense under the previous sibling and saves that parentId', async () => {
    mockListLexemes.mockResolvedValue([
      {
        id: 'lex-dog',
        lemma: { default: 'dog' },
        senses: [
          { id: 'sense_primary', gloss: { default: 'canine' } },
          { id: 'sense_pet', parentId: 'sense_primary', gloss: { default: 'pet' } },
          { id: 'sense_hound', parentId: 'sense_primary', gloss: { default: 'hound' } },
        ],
        language: 'eng',
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ] satisfies LexemeDocType[]);
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-edit');
    expect((screen.getByTestId('lexicon-entry-lemma') as HTMLInputElement).value).toBe('dog');
    expect((screen.getByTestId('lexicon-entry-demote-sense-0') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId('lexicon-entry-extra-sense-1').getAttribute('data-depth')).toBe('1');
    fireEvent.click(screen.getByTestId('lexicon-entry-demote-sense-1'));
    expect(screen.getByTestId('lexicon-entry-extra-sense-1').getAttribute('data-depth')).toBe('2');
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses[2]?.parentId).toBe('sense_pet');
    expect(saved.senses.map((sense) => sense.gloss.default)).toEqual(['canine', 'pet', 'hound']);
    expect(screen.getByTestId('lexicon-workspace-sense-2').getAttribute('data-depth')).toBe('2');
  });

  it('does not remap remaining nested ids when a middle extra sense or form is removed', async () => {
    mockListLexemes.mockResolvedValue([
      {
        id: 'lex-dog',
        lemma: { default: 'dog' },
        senses: [
          { id: 'sense_primary', gloss: { default: 'canine' } },
          { id: 'sense_pet', gloss: { default: 'pet' } },
          { id: 'sense_follow', gloss: { default: 'follow' } },
          { id: 'sense_food', gloss: { default: 'hot dog' } },
        ],
        forms: [
          { id: 'form_dogs', transcription: { default: 'dogs' } },
          { id: 'form_doggie', transcription: { default: 'doggie' } },
          { id: 'form_hound', transcription: { default: 'hound' } },
        ],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ] satisfies LexemeDocType[]);

    renderLexiconPage();
    fireEvent.click(await screen.findByTestId('lexicon-entry-remove-sense-1'));
    fireEvent.click(screen.getByTestId('lexicon-entry-remove-form-1'));
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.senses.map((sense) => sense.id)).toEqual([
      'sense_primary',
      'sense_pet',
      'sense_food',
    ]);
    expect((saved.forms ?? []).map((form) => form.id)).toEqual(['form_dogs', 'form_hound']);
  });

  it('exports the loaded lexeme list as LIFT', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:lift');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderLexiconPage();
    await screen.findByText('domesticated canine');
    const exportButton = screen.getByTestId('lexicon-lift-export') as HTMLButtonElement;
    expect(exportButton.disabled).toBe(false);
    fireEvent.click(exportButton);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    const xml = await blob.text();
    expect(xml).toContain('<lift version="0.13" producer="Jieyu">');
    expect(xml).toContain('id="lex-dog"');
    expect(xml).toContain('id="lex-run"');
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('imports a LIFT file and readback-lists the new entry', async () => {
    mockListLexemes.mockResolvedValue([]);
    renderLexiconPage();
    await screen.findByTestId('lexicon-lift-import');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="Jieyu"><entry id="lex-fox"><lexical-unit><form lang="eng"><text>fox</text></form></lexical-unit><sense id="sense_fox" order="0"><gloss lang="eng"><text>vulpine</text></gloss></sense></entry></lift>
`;
    const input = screen.getByTestId('lexicon-lift-import-input') as HTMLInputElement;
    const file = new File([xml], 'jieyu-lexicon.lift', { type: 'application/xml' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls[0]?.[0] as LexemeDocType;
    expect(saved.id).toBe('lex-fox');
    expect(Object.values(saved.lemma)).toContain('fox');
    expect((await screen.findAllByText('fox')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vulpine/).length).toBeGreaterThan(0);
  });

  it('does not write when the LIFT file is invalid', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-lift-import-input');
    const input = screen.getByTestId('lexicon-lift-import-input') as HTMLInputElement;
    const file = new File(['<not-lift/>'], 'bad.lift', { type: 'application/xml' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByTestId('lexicon-lift-import-error').textContent).toContain(
        '无法读取这个 LIFT 文件',
      );
    });
    expect(mockSaveLexeme).not.toHaveBeenCalled();
  });

  it('deletes the selected entry after confirm and drops it from the list', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-delete');
    fireEvent.click(screen.getByTestId('lexicon-entry-delete'));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => {
      expect(mockDeleteLexeme).toHaveBeenCalledWith('lex-dog');
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /dog/i })).toBeNull();
    });
  });

  it('does not write when delete is cancelled', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-entry-delete');
    fireEvent.click(screen.getByTestId('lexicon-entry-delete'));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(mockDeleteLexeme).not.toHaveBeenCalled();
    expect(screen.getAllByText('dog').length).toBeGreaterThan(0);
  });
});
