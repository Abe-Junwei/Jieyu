// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { detectLocale, t } from '../i18n';
import { useImportExport } from './useImportExport';

const mockReadFileAsText = vi.hoisted(() => vi.fn());
const mockImportJieyuArchiveFile = vi.hoisted(() => vi.fn());

vi.mock('./useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock('../services/EafService', async () => {
  const actual = await vi.importActual('../services/EafService');
  return {
    ...actual,
    readFileAsText: mockReadFileAsText,
  };
});

vi.mock('../services/JymService', async () => {
  const actual = await vi.importActual('../services/JymService');
  return {
    ...actual,
    importJieyuArchiveFile: mockImportJieyuArchiveFile,
  };
});

function createInput() {
  return {
    activeTextId: 'text-1',
    getActiveTextId: vi.fn(async () => 'text-1'),
    selectedUtteranceMedia: undefined,
    utterancesOnCurrentMedia: [],
    anchors: [],
    layers: [],
    translations: [],
    defaultTranscriptionLayerId: undefined,
    loadSnapshot: vi.fn(async () => undefined),
    setSaveState: vi.fn(),
  };
}

describe('useImportExport - import error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportJieyuArchiveFile.mockReset();
  });

  it('should surface read-file error via import failed message', async () => {
    const input = createInput();
    mockReadFileAsText.mockRejectedValueOnce(new Error('boom read'));

    const { result } = renderHook(() => useImportExport(input));

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
    mockReadFileAsText.mockRejectedValueOnce(conflict);

    const { result } = renderHook(() => useImportExport(input));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.eaf', { type: 'text/xml' }));
    });

    const locale = detectLocale();
    expect(input.setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: t(locale, 'transcription.importExport.conflict'),
      errorMeta: expect.objectContaining({
        category: 'conflict',
        i18nKey: 'transcription.importExport.conflict',
      }),
    }));
  });

  it('should surface archive replace-all error via import failed message', async () => {
    const input = createInput();
    mockImportJieyuArchiveFile.mockRejectedValueOnce(new Error('archive broken'));

    const { result } = renderHook(() => useImportExport(input));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.jym', { type: 'application/octet-stream' }));
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
    mockImportJieyuArchiveFile.mockRejectedValueOnce(conflict);

    const { result } = renderHook(() => useImportExport(input));

    await act(async () => {
      await result.current.handleImportFile(new File(['x'], 'demo.jym', { type: 'application/octet-stream' }));
    });

    const locale = detectLocale();
    expect(input.setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: t(locale, 'transcription.importExport.conflict'),
      errorMeta: expect.objectContaining({
        category: 'conflict',
        i18nKey: 'transcription.importExport.conflict',
      }),
    }));
  });
});
