/**
 * RD-3：没有当前项目时导入只含一个项目的包，导入后切到该项目，而不是停在空白工作区。
 * RD-3: importing a single-project archive with no current project switches to that project
 * instead of leaving a blank workspace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearActiveProjectTextId,
  getActiveProjectTextId,
  publishActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';

const { mockImportJieyuArchiveFile } = vi.hoisted(() => ({
  mockImportJieyuArchiveFile: vi.fn(),
}));

vi.mock('../../services/JymService', () => ({
  importJieyuArchiveFile: mockImportJieyuArchiveFile,
  previewJieyuArchiveFile: vi.fn(),
}));

import { createImportExportArchiveHandlers } from './useImportExport.archiveHandlers';

function archiveResult(importedTextIds: string[]) {
  return {
    kind: 'jyt',
    importResult: { collections: { texts: { received: 1, written: 1, skipped: 0 } } },
    manifest: {},
    importedTextIds,
  };
}

async function runImport(activeTextId: string | null, importedTextIds: string[]) {
  mockImportJieyuArchiveFile.mockResolvedValueOnce(archiveResult(importedTextIds));
  const loadSnapshot = vi.fn(async (_textId: string) => undefined);
  const setSaveState = vi.fn();
  const handlers = createImportExportArchiveHandlers({
    activeTextId,
    loadSnapshot,
    locale: 'zh-CN',
    setSaveState,
  });
  const ok = await handlers.importProjectArchive(new File(['x'], 'p.jyt'), 'upsert');
  return { ok, loadSnapshot, setSaveState };
}

describe('RD-3: archive import with no current project', () => {
  beforeEach(() => {
    clearActiveProjectTextId();
    mockImportJieyuArchiveFile.mockReset();
  });
  afterEach(() => clearActiveProjectTextId());

  it('switches to the only imported project when none is current', async () => {
    const { ok, loadSnapshot } = await runImport(null, ['text-imported']);
    expect(ok).toBe(true);
    expect(loadSnapshot).toHaveBeenCalledWith('text-imported');
    expect(getActiveProjectTextId()).toBe('text-imported');
  });

  it('stays on the current project when there is one', async () => {
    publishActiveProjectTextId('text-current');
    const { loadSnapshot } = await runImport(null, ['text-imported']);
    expect(loadSnapshot).toHaveBeenCalledWith('text-current');
    expect(getActiveProjectTextId()).toBe('text-current');

    const explicit = await runImport('text-explicit', ['text-imported']);
    expect(explicit.loadSnapshot).toHaveBeenCalledWith('text-explicit');
  });

  it('does not guess when the archive carries several projects', async () => {
    const { loadSnapshot } = await runImport(null, ['text-a', 'text-b']);
    expect(loadSnapshot).toHaveBeenCalledWith('');
    expect(getActiveProjectTextId()).toBe('');
  });
});
