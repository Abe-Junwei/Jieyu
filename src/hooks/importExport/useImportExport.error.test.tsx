// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { t } from '../../i18n';
import { createLocaleWrapper } from '../../test/localeTestUtils';
import { useImportExport } from './useImportExport';

const mockIngestTextFile = vi.hoisted(() => vi.fn());
const mockRestoreProjectPackageAsNew = vi.hoisted(() => vi.fn());
const mockDetectProjectPackageKind = vi.hoisted(() => vi.fn(() => 'jym'));
const mockDownloadProjectJym = vi.hoisted(() => vi.fn(async () => undefined));
const mockUseOrthographies = vi.hoisted(() => vi.fn(() => []));

vi.mock('../ui/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock('../../utils/textIngestion', () => ({
  ingestTextFile: mockIngestTextFile,
}));

vi.mock('../../services/projectPackageService', async () => {
  const actual = await vi.importActual('../../services/projectPackageService');
  return {
    ...actual,
    detectProjectPackageKind: mockDetectProjectPackageKind,
    restoreProjectPackageAsNew: mockRestoreProjectPackageAsNew,
  };
});

vi.mock('../../services/JymService', async () => {
  const actual = await vi.importActual('../../services/JymService');
  return {
    ...actual,
    downloadProjectJym: mockDownloadProjectJym,
  };
});

vi.mock('../orthography/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

function createInput() {
  return {
    activeTextId: 'text-1',
    getActiveTextId: vi.fn(async () => 'text-1'),
    selectedUnitMedia: undefined,
    unitsOnCurrentMedia: [],
    anchors: [],
    layers: [],
    translations: [],
    defaultTranscriptionLayerId: undefined,
    loadSnapshot: vi.fn(async () => undefined),
    setSaveState: vi.fn(),
  };
}

const localeWrapper = createLocaleWrapper('zh-CN');

describe('useImportExport - import error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRestoreProjectPackageAsNew.mockReset();
    mockDetectProjectPackageKind.mockReset();
    mockDetectProjectPackageKind.mockReturnValue('jym');
    mockDownloadProjectJym.mockReset();
    mockUseOrthographies.mockReturnValue([]);
  });

  it('should surface read-file error via import failed message', async () => {
    const input = createInput();
    mockIngestTextFile.mockRejectedValueOnce(new Error('boom read'));

    const { result } = renderHook(() => useImportExport(input), { wrapper: localeWrapper });

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.eaf', { type: 'text/xml' }));
    });

    expect(input.setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: expect.stringContaining('boom read'),
        errorMeta: expect.objectContaining({
          category: 'action',
          i18nKey: 'transcription.importExport.failed',
        }),
      }),
    );
  });

  it('should map conflict-like read error to conflict i18n message', async () => {
    const input = createInput();
    const conflict = new Error('row changed externally');
    conflict.name = 'TranscriptionPersistenceConflictError';
    mockIngestTextFile.mockRejectedValueOnce(conflict);

    const { result } = renderHook(() => useImportExport(input), { wrapper: localeWrapper });

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.eaf', { type: 'text/xml' }));
    });

    expect(input.setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: t('zh-CN', 'transcription.importExport.conflict'),
        errorMeta: expect.objectContaining({
          category: 'conflict',
          i18nKey: 'transcription.importExport.conflict',
        }),
      }),
    );
  });

  it('annotation import rejects project archives instead of replacing the whole database (N3 / T10)', async () => {
    const input = createInput();

    const { result } = renderHook(() => useImportExport(input), { wrapper: localeWrapper });

    for (const name of ['demo.jym', 'demo.JYT']) {
      await act(async () => {
        await result.current.handleImportFile(
          new File(['x'], name, { type: 'application/octet-stream' }),
        );
      });
    }

    expect(mockRestoreProjectPackageAsNew).not.toHaveBeenCalled();
    expect(mockIngestTextFile).not.toHaveBeenCalled();
    expect(input.setSaveState).toHaveBeenCalledWith({
      kind: 'error',
      message: t('zh-CN', 'transcription.importExport.archiveUseProjectImport'),
    });
  });

  it('should surface archive restore error via import failed message', async () => {
    const input = createInput();
    mockRestoreProjectPackageAsNew.mockRejectedValueOnce(new Error('archive broken'));

    const { result } = renderHook(() => useImportExport(input), { wrapper: localeWrapper });

    await act(async () => {
      await result.current.importProjectArchive(
        new File(['x'], 'demo.jym', { type: 'application/octet-stream' }),
        'replace-all',
      );
    });

    expect(input.setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: expect.stringContaining('archive broken'),
        errorMeta: expect.objectContaining({
          category: 'action',
          i18nKey: 'transcription.importExport.failed',
        }),
      }),
    );
  });

  it('should map archive conflict error to conflict i18n message', async () => {
    const input = createInput();
    const conflict = new Error('external write conflict');
    conflict.name = 'RecoveryApplyConflictError';
    mockRestoreProjectPackageAsNew.mockRejectedValueOnce(conflict);

    const { result } = renderHook(() => useImportExport(input), { wrapper: localeWrapper });

    await act(async () => {
      await result.current.importProjectArchive(
        new File(['x'], 'demo.jym', { type: 'application/octet-stream' }),
        'replace-all',
      );
    });

    expect(input.setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: t('zh-CN', 'transcription.importExport.conflict'),
        errorMeta: expect.objectContaining({
          category: 'conflict',
          i18nKey: 'transcription.importExport.conflict',
        }),
      }),
    );
  });

  it('should confirm archive export and pass optional encryption options to downloader', async () => {
    const input = createInput();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(true);
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('secret-pass')
      .mockReturnValueOnce('team-shared');

    const { result } = renderHook(() => useImportExport(input), { wrapper: localeWrapper });

    await act(async () => {
      await result.current.handleExportJym();
    });

    expect(mockDownloadProjectJym).toHaveBeenCalledWith('text-1', 'jieyu-project', {
      encryption: {
        password: 'secret-pass',
        passwordHint: 'team-shared',
      },
    });
  });
});
