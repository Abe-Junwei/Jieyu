// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppSidePaneProvider,
  useAppSidePaneRegistrationSnapshot,
} from '../contexts/AppSidePaneContext';
import type { LexemeDocType, LexemeEntryDoc } from '../db';
import { LocaleProvider } from '../i18n';
import { LexiconPage } from './LexiconPage';
import { dispatchWorkspaceUnitUpdated } from '../utils/workspaceEvents';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';

const {
  mockListLexemes,
  mockSaveLexeme,
  mockDeleteLexeme,
  mockGetResource,
  mockListLexemeTranscriptionJumpTargets,
  mockListAttachments,
  mockAttachFile,
  mockUnlinkAttachment,
  featureFlagState,
} = vi.hoisted(() => ({
  mockListLexemes: vi.fn(),
  mockSaveLexeme: vi.fn(),
  mockDeleteLexeme: vi.fn(),
  mockGetResource: vi.fn(),
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
      getResource: mockGetResource,
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

const now = '2026-04-04T00:00:00.000Z';

function entry(id: string, headword: string, translation: string, definition = ''): LexemeEntryDoc {
  return {
    id,
    textId: 'text-1',
    entry: {
      id,
      headword,
      senses: [
        {
          id: `${id}-sense`,
          headwordTranslations: [{ text: translation, langCode: 'en' }],
          ...(definition.length > 0 ? { definitions: [{ text: definition }] } : {}),
        },
      ],
    },
    createdAt: now,
    updatedAt: now,
  };
}

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

function renderLexiconPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/lexicon']}>
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

/**
 * 等编辑器把选中词条填进表单（重置 effect 已执行）再交互；只等元素出现时，挂起的重置 effect
 * 可能在下一次事件前才运行，冲掉刚输入的值或刚打开的删除确认框（偶发失败的根因）。
 * Wait until the editor has loaded the selected entry (its reset effect has run) before
 * interacting. Waiting only for the element lets a pending reset effect run right before the next
 * event and wipe the typed value or the just-opened delete confirm (the flake's root cause).
 */
async function waitForEditorLoaded(headword = 'dog'): Promise<void> {
  await waitFor(() => {
    expect((screen.getByTestId('lexicon-entry-headword') as HTMLInputElement).value).toBe(headword);
  });
}

describe('LexiconPage', () => {
  beforeEach(() => {
    mockListLexemes.mockReset();
    mockSaveLexeme.mockReset();
    mockDeleteLexeme.mockReset();
    mockGetResource.mockReset();
    mockListLexemeTranscriptionJumpTargets.mockReset();
    mockListAttachments.mockReset();
    mockAttachFile.mockReset();
    mockUnlinkAttachment.mockReset();
    featureFlagState.lexiconAttachmentsEnabled = false;
    mockGetResource.mockResolvedValue(null);
    mockListAttachments.mockResolvedValue([]);
    mockListLexemes.mockResolvedValue([
      entry('lex-dog', 'dog', 'canine', 'domesticated canine'),
      entry('lex-run', 'run', 'move quickly'),
    ]);
    mockListLexemeTranscriptionJumpTargets.mockResolvedValue([]);
    mockSaveLexeme.mockImplementation(async (doc: LexemeDocType) => {
      if (doc.kind === 'resource') {
        mockGetResource.mockResolvedValue(doc);
        return doc.id;
      }
      const current = (await mockListLexemes()) as LexemeEntryDoc[];
      const next = current.some((row) => row.id === doc.id)
        ? current.map((row) => (row.id === doc.id ? doc : row))
        : [...current, doc];
      mockListLexemes.mockResolvedValue(next);
      return doc.id;
    });
    mockDeleteLexeme.mockImplementation(async (lexemeId: string) => {
      const current = (await mockListLexemes()) as LexemeEntryDoc[];
      mockListLexemes.mockResolvedValue(current.filter((row) => row.id !== lexemeId));
    });
    window.sessionStorage.clear();
    publishActiveProjectTextId('text-lexicon');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    clearActiveProjectTextId();
  });

  it('downloads a DMLex JSON document for the listed entries', async () => {
    let captured: Blob | undefined;
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((value: Blob | MediaSource) => {
        if (value instanceof Blob) captured = value;
        return 'blob:dmlex';
      });
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderLexiconPage();
      await screen.findByText('domesticated canine');
      fireEvent.click(screen.getByTestId('lexicon-dmlex-export'));
      await waitFor(() => {
        expect(captured).toBeInstanceOf(Blob);
      });
      if (!(captured instanceof Blob)) return;
      const parsed = JSON.parse(await captured.text()) as {
        entries: Array<{ headword: string }>;
      };
      expect(parsed.entries.map((row) => row.headword).sort()).toEqual(['dog', 'run']);
      expect(click).toHaveBeenCalled();
    } finally {
      click.mockRestore();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('loads the workspace and shows the headword and translation', async () => {
    renderLexiconPage();
    await waitFor(() => {
      expect(screen.getAllByText('dog').length).toBeGreaterThan(0);
      expect(screen.getByText('domesticated canine')).toBeTruthy();
      expect(screen.getByTestId('side-pane-subtitle').textContent).toBe('dog');
    });
    expect(screen.getByTestId('side-pane-content').textContent).toContain('canine');
    await waitForEditorLoaded();
    expect((screen.getByTestId('lexicon-entry-translation') as HTMLInputElement).value).toBe(
      'canine',
    );
  });

  it('filters by translation text', async () => {
    renderLexiconPage();
    const searchInput = await screen.findByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'move quickly' } });
    await waitFor(() => {
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
        linkUpdatedAt: now,
      },
    ]);
    renderLexiconPage();
    const unitHit = await screen.findByRole('link', { name: /主句段/ });
    expect(unitHit.getAttribute('href')).toBe(
      '/transcription?textId=text-1&mediaId=media-1&layerId=layer-1&unitId=unit-1&lexiconReturn=lex-dog',
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
        linkUpdatedAt: now,
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

  it('saves an edited headword and translation, then readback lists them', async () => {
    renderLexiconPage();
    await waitForEditorLoaded();
    fireEvent.change(screen.getByTestId('lexicon-entry-headword'), { target: { value: 'hound' } });
    fireEvent.change(screen.getByTestId('lexicon-entry-translation'), {
      target: { value: 'hunting dog' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(mockSaveLexeme).toHaveBeenCalled();
    });
    const saved = mockSaveLexeme.mock.calls.find((call) => call[0]?.kind !== 'resource')?.[0] as
      | LexemeEntryDoc
      | undefined;
    expect(saved?.entry.headword).toBe('hound');
    expect(saved?.entry.senses?.[0]?.headwordTranslations?.[0]?.text).toBe('hunting dog');
    await waitFor(() => {
      expect(screen.getByTestId('lexicon-workspace-list').textContent).toContain('hound');
      expect(screen.getAllByText('hunting dog').length).toBeGreaterThan(0);
    });
    expect(await screen.findByText('已保存')).toBeTruthy();
  });

  it('does not write when the headword is empty', async () => {
    renderLexiconPage();
    await waitForEditorLoaded();
    fireEvent.change(screen.getByTestId('lexicon-entry-headword'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    expect(await screen.findByText('词头必填。')).toBeTruthy();
    expect(mockSaveLexeme).not.toHaveBeenCalled();
  });

  it('creates a new entry then selects it from list readback', async () => {
    renderLexiconPage();
    await waitForEditorLoaded();
    fireEvent.click(screen.getByTestId('lexicon-entry-create'));
    await waitForEditorLoaded('');
    fireEvent.change(screen.getByTestId('lexicon-entry-headword'), { target: { value: 'cat' } });
    fireEvent.change(screen.getByTestId('lexicon-entry-translation'), {
      target: { value: 'feline' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      expect(screen.getAllByText('cat').length).toBeGreaterThan(0);
      expect(screen.getAllByText('feline').length).toBeGreaterThan(0);
    });
  });

  it('saves a subsense relation on the resource row', async () => {
    renderLexiconPage();
    await waitForEditorLoaded();
    fireEvent.click(screen.getByTestId('lexicon-entry-add-subsense-0'));
    fireEvent.change(await screen.findByTestId('lexicon-entry-sense-1-translation'), {
      target: { value: 'timber' },
    });
    fireEvent.click(screen.getByTestId('lexicon-entry-save'));
    await waitFor(() => {
      const resource = mockSaveLexeme.mock.calls
        .map((call) => call[0] as LexemeDocType)
        .find((doc) => doc.kind === 'resource');
      expect(
        resource && resource.kind === 'resource' ? resource.resource.relations?.[0]?.type : '',
      ).toBe('subsense');
    });
  });

  it('imports a LIFT file and lists the projected headword', async () => {
    mockListLexemes.mockResolvedValue([]);
    renderLexiconPage();
    await screen.findByTestId('lexicon-lift-import');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="Jieyu"><entry id="lex-fox"><lexical-unit><form lang="eng"><text>fox</text></form></lexical-unit><sense id="sense_fox"><gloss lang="en"><text>vulpine</text></gloss></sense></entry></lift>`;
    fireEvent.change(screen.getByTestId('lexicon-lift-import-input'), {
      target: { files: [new File([xml], 'jieyu-lexicon.lift', { type: 'application/xml' })] },
    });
    await waitFor(() => {
      expect(screen.getAllByText('fox').length).toBeGreaterThan(0);
      expect(screen.getAllByText('vulpine').length).toBeGreaterThan(0);
    });
  });

  it('does not write when the LIFT file is invalid', async () => {
    renderLexiconPage();
    await screen.findByTestId('lexicon-lift-import-input');
    fireEvent.change(screen.getByTestId('lexicon-lift-import-input'), {
      target: { files: [new File(['<not-lift/>'], 'bad.lift', { type: 'application/xml' })] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('lexicon-lift-import-error').textContent).toContain(
        '无法读取这个 LIFT 文件',
      );
    });
    expect(mockSaveLexeme).not.toHaveBeenCalled();
  });

  it('deletes the selected entry after confirm', async () => {
    renderLexiconPage();
    await waitForEditorLoaded();
    fireEvent.click(screen.getByTestId('lexicon-entry-delete'));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    await waitFor(() => {
      expect(mockDeleteLexeme).toHaveBeenCalledWith('lex-dog');
      expect(screen.queryByRole('button', { name: /dog/i })).toBeNull();
    });
  });
});
