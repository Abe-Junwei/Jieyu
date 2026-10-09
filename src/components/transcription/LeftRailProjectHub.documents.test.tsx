// @vitest-environment jsdom
/**
 * 第 5 批：项目中心的「标注文稿」菜单与「导入为新文稿」选项。
 * Batch 5: the project hub "Annotation documents" menu and the "import as a new document" option.
 */
import 'fake-indexeddb/auto';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { LocaleProvider } from '../../i18n';
import { LeftRailProjectHub } from './LeftRailProjectHub';
import { ensureDefaultAnnotationDocument } from '../../services/annotationDocumentService';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';

const P = 'text-docs';
const NOW = '2026-10-09T00:00:00.000Z';

vi.mock('../../utils/projectRoster', () => ({
  PROJECT_ROSTER_QUERY_KEY: 'projectRoster',
  loadProjectRoster: vi.fn(async () => [
    { textId: 'text-docs', title: '文稿项目', updatedAt: NOW },
  ]),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function renderHub() {
  const onAnnotationDocumentsChanged = vi.fn(async () => undefined);
  const onImportAnnotationFile = vi.fn(async () => undefined);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <LocaleProvider locale="zh-CN">
          <LeftRailProjectHub
            currentProjectLabel="文稿项目"
            importFileRef={{ current: null }}
            canDeleteProject
            canDeleteAudio
            onOpenProjectSetup={vi.fn()}
            onOpenAudioImport={vi.fn()}
            onDeleteCurrentProject={vi.fn()}
            onDeleteCurrentAudio={vi.fn()}
            onOpenSpeakerManagementPanel={vi.fn()}
            onImportAnnotationFile={onImportAnnotationFile}
            onAnnotationDocumentsChanged={onAnnotationDocumentsChanged}
            onPreviewProjectArchiveImport={vi.fn()}
            onImportProjectArchive={vi.fn(async () => true)}
            onExportEaf={vi.fn()}
            onExportTextGrid={vi.fn()}
            onExportTrs={vi.fn()}
            onExportFlextext={vi.fn()}
            onExportToolbox={vi.fn()}
            onExportJyt={vi.fn(async () => undefined)}
            onExportJym={vi.fn(async () => undefined)}
            onExportLite={vi.fn(async () => undefined)}
          />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onAnnotationDocumentsChanged, onImportAnnotationFile };
}

async function openDocumentsMenu(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /文稿项目|打开项目中心/ }));
  fireEvent.mouseEnter(
    (await screen.findByText('标注文稿')).closest('button') as HTMLButtonElement,
  );
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
  await db.texts.put({ id: P, title: { default: P }, createdAt: NOW, updatedAt: NOW });
  publishActiveProjectTextId(P);
  const host = document.createElement('div');
  host.id = 'left-rail-project-hub-slot';
  document.body.appendChild(host);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearActiveProjectTextId();
  document.getElementById('left-rail-project-hub-slot')?.remove();
});

describe('LeftRailProjectHub annotation documents (batch 5)', () => {
  it('creates, switches and deletes documents from the menu', async () => {
    const first = await ensureDefaultAnnotationDocument(P);
    const { onAnnotationDocumentsChanged } = renderHub();

    await openDocumentsMenu();
    expect(await screen.findByText('文稿 1')).toBeTruthy();
    expect((screen.getByTestId('annotation-document-delete') as HTMLButtonElement).disabled).toBe(
      true,
    );

    vi.spyOn(window, 'prompt').mockReturnValue('访谈二');
    fireEvent.click(screen.getByTestId('annotation-document-create'));
    await waitFor(() => expect(onAnnotationDocumentsChanged).toHaveBeenCalledTimes(1));
    const docs = await db.annotation_documents.where('textId').equals(P).toArray();
    expect(docs).toHaveLength(2);
    const second = docs.find((doc) => doc.id !== first)!;
    expect(second.title).toEqual({ und: '访谈二' });
    expect((await db.texts.get(P))?.defaultDocumentId).toBe(second.id);

    await openDocumentsMenu();
    fireEvent.click(await screen.findByText('文稿 1'));
    await waitFor(() => expect(onAnnotationDocumentsChanged).toHaveBeenCalledTimes(2));
    expect((await db.texts.get(P))?.defaultDocumentId).toBe(first);

    await openDocumentsMenu();
    await screen.findByText('访谈二');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await waitFor(() =>
      expect((screen.getByTestId('annotation-document-delete') as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByTestId('annotation-document-delete'));
    await waitFor(() => expect(onAnnotationDocumentsChanged).toHaveBeenCalledTimes(3));
    expect(confirm).toHaveBeenCalled();
    const left = await db.annotation_documents.where('textId').equals(P).toArray();
    expect(left.map((doc) => doc.id)).toEqual([second.id]);
    expect((await db.texts.get(P))?.defaultDocumentId).toBe(second.id);
  });

  it('cancelled prompts and confirms change nothing', async () => {
    await ensureDefaultAnnotationDocument(P);
    const { onAnnotationDocumentsChanged } = renderHub();
    await openDocumentsMenu();
    await screen.findByText('文稿 1');
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    fireEvent.click(screen.getByTestId('annotation-document-create'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onAnnotationDocumentsChanged).not.toHaveBeenCalled();
    expect(await db.annotation_documents.where('textId').equals(P).count()).toBe(1);
  });

  it('passes the new-document target from the annotation import dialog', async () => {
    const { onImportAnnotationFile } = renderHub();
    const file = new File(['annotation'], 'demo.eaf', { type: 'application/xml' });
    const input = document.querySelector(
      'input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole('dialog', { name: '导入标注文件' });
    fireEvent.click(screen.getByTestId('annotation-import-as-new-document'));
    fireEvent.click(screen.getByRole('button', { name: '开始导入标注' }));
    await waitFor(() =>
      expect(onImportAnnotationFile).toHaveBeenCalledWith(
        file,
        'preserve-source-and-bridge',
        'new-document',
      ),
    );
  });
});
