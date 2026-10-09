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
  mockImportJybProjectsAsNew,
  mockDisasterRestoreFromJyb,
} = vi.hoisted(() => ({
  mockIsJybPackage: vi.fn(async () => false),
  mockIsRawIdbSnapshot: vi.fn(async () => false),
  mockDetectProjectPackageKind: vi.fn(async () => 'jyt' as const),
  mockRestoreProjectPackageAsNew: vi.fn(),
  mockImportJybProjectsAsNew: vi.fn(),
  mockDisasterRestoreFromJyb: vi.fn(),
}));

vi.mock('../../services/JybService', () => ({
  isJybPackage: mockIsJybPackage,
  previewJybRestore: vi.fn(),
  disasterRestoreFromJyb: mockDisasterRestoreFromJyb,
  importJybProjectsAsNew: mockImportJybProjectsAsNew,
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
    skippedOrphanRows: [] as Array<{ collection: string; count: number }>,
  };
}

async function runImport(
  activeTextId: string | null,
  projectId: string,
  result = restoreResult(projectId),
) {
  mockRestoreProjectPackageAsNew.mockResolvedValueOnce(result);
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

  it('the completion message says how many orphan rows were dropped (BF1N3-2)', async () => {
    const result = restoreResult('text-imported');
    result.skippedOrphanRows = [
      { collection: 'unit_tokens', count: 2 },
      { collection: 'unit_morphemes', count: 1 },
    ];
    const { setSaveState } = await runImport(null, 'text-imported', result);
    expect(setSaveState).toHaveBeenLastCalledWith({
      kind: 'done',
      message: expect.stringContaining('另有 3 条记录的上级记录不在包里，已跳过。'),
    });
  });
});

describe('RD-3: JYB import with no current project (R2-1)', () => {
  const importResult = { collections: { texts: { received: 1, written: 1, skipped: 0 } } };
  const runJyb = async (restoreMode?: 'disaster-restore') => {
    const loadSnapshot = vi.fn(async (_textId: string) => undefined);
    const setSaveState = vi.fn();
    const handlers = createImportExportArchiveHandlers({
      activeTextId: null,
      loadSnapshot,
      locale: 'zh-CN',
      setSaveState,
    });
    const ok = await handlers.importProjectArchive(
      new File(['x'], 'lib.jyb'),
      'upsert',
      restoreMode,
    );
    return { ok, loadSnapshot, setSaveState };
  };

  beforeEach(() => {
    clearActiveProjectTextId();
    mockIsJybPackage.mockReset().mockResolvedValue(true);
    mockIsRawIdbSnapshot.mockReset().mockResolvedValue(false);
    mockImportJybProjectsAsNew.mockReset().mockResolvedValue({
      projects: [
        {
          projectId: 'new-1',
          sourceProjectId: 's1',
          title: { default: 'A' },
          skippedOrphanRows: [],
        },
      ],
      importResult,
      skippedLanguageIds: [],
    });
    mockDisasterRestoreFromJyb.mockReset().mockResolvedValue({
      projectIds: ['p1', 'p2'],
      snapshotSeq: 1,
      importResult,
      restoredPreferenceKeys: [],
    });
  });
  afterEach(() => clearActiveProjectTextId());

  it('per-project import opens and publishes the first imported project', async () => {
    const { ok, loadSnapshot } = await runJyb();
    expect(ok).toBe(true);
    expect(loadSnapshot).toHaveBeenCalledWith('new-1');
    expect(getActiveProjectTextId()).toBe('new-1');
  });

  it('per-project import stays on the published current project', async () => {
    publishActiveProjectTextId('text-current');
    const { loadSnapshot } = await runJyb();
    expect(loadSnapshot).toHaveBeenCalledWith('text-current');
    expect(getActiveProjectTextId()).toBe('text-current');
  });

  it('per-project import counts dropped orphans of the imported projects only (BF1N3-2)', async () => {
    // importJybProjectsAsNew 只返回勾选的项目 | importJybProjectsAsNew returns the checked projects only
    mockImportJybProjectsAsNew.mockResolvedValueOnce({
      projects: [
        {
          projectId: 'n1',
          sourceProjectId: 's1',
          skippedOrphanRows: [{ collection: 'unit_tokens', count: 2 }],
        },
        {
          projectId: 'n2',
          sourceProjectId: 's2',
          skippedOrphanRows: [{ collection: 'unit_tokens', count: 1 }],
        },
      ],
      importResult,
      skippedLanguageIds: [],
    });
    const { setSaveState } = await runJyb();
    expect(setSaveState).toHaveBeenLastCalledWith({
      kind: 'done',
      message: expect.stringContaining('另有 3 条记录的上级记录不在包里，已跳过。'),
    });
  });

  it('disaster restore publishes the opened project as active', async () => {
    const { ok, loadSnapshot } = await runJyb('disaster-restore');
    expect(ok).toBe(true);
    expect(loadSnapshot).toHaveBeenCalledWith('p1');
    expect(getActiveProjectTextId()).toBe('p1');
  });
});
