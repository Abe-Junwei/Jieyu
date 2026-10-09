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

const {
  mockIsJybPackage,
  mockIsRawIdbSnapshot,
  mockDetectProjectPackageKind,
  mockRestoreProjectPackageAsNew,
} = vi.hoisted(() => ({
  mockIsJybPackage: vi.fn(async () => false),
  mockIsRawIdbSnapshot: vi.fn(async () => false),
  mockDetectProjectPackageKind: vi.fn(async () => 'jyt' as const),
  mockRestoreProjectPackageAsNew: vi.fn(),
}));

vi.mock('../../services/JybService', () => ({
  isJybPackage: mockIsJybPackage,
  previewJybRestore: vi.fn(),
  disasterRestoreFromJyb: vi.fn(),
  importJybProjectsAsNew: vi.fn(),
}));

vi.mock('../../services/rawSnapshotConverter', () => ({
  isRawIdbSnapshot: mockIsRawIdbSnapshot,
  convertRawSnapshotToJyb: vi.fn(),
}));

vi.mock('../../services/projectPackageService', () => ({
  detectProjectPackageKind: mockDetectProjectPackageKind,
  restoreProjectPackageAsNew: mockRestoreProjectPackageAsNew,
  previewProjectPackageRestore: vi.fn(),
  overwriteProjectWithPackage: vi.fn(),
}));

import { createImportExportArchiveHandlers } from './useImportExport.archiveHandlers';

function restoreResult(projectId: string) {
  return {
    kind: 'jyt',
    projectId,
    title: { default: 'Restored' },
    sourceProjectId: 'source',
    importResult: { collections: { texts: { received: 1, written: 1, skipped: 0 } } },
    skippedLanguageIds: [],
  };
}

async function runImport(activeTextId: string | null, projectId: string) {
  mockRestoreProjectPackageAsNew.mockResolvedValueOnce(restoreResult(projectId));
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
    mockIsJybPackage.mockReset().mockResolvedValue(false);
    mockIsRawIdbSnapshot.mockReset().mockResolvedValue(false);
    mockDetectProjectPackageKind.mockReset().mockResolvedValue('jyt');
    mockRestoreProjectPackageAsNew.mockReset();
  });
  afterEach(() => clearActiveProjectTextId());

  it('switches to the restored project when none is current', async () => {
    const { ok, loadSnapshot } = await runImport(null, 'text-imported');
    expect(ok).toBe(true);
    expect(loadSnapshot).toHaveBeenCalledWith('text-imported');
    expect(getActiveProjectTextId()).toBe('text-imported');
  });

  it('stays on the current project when there is one', async () => {
    publishActiveProjectTextId('text-current');
    const { loadSnapshot } = await runImport(null, 'text-imported');
    expect(loadSnapshot).toHaveBeenCalledWith('text-current');
    expect(getActiveProjectTextId()).toBe('text-current');

    const explicit = await runImport('text-explicit', 'text-imported');
    expect(explicit.loadSnapshot).toHaveBeenCalledWith('text-explicit');
  });
});
