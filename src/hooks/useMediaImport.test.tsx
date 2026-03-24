// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaImport } from './useMediaImport';

const mockCreateProject = vi.hoisted(() => vi.fn());
const mockImportAudio = vi.hoisted(() => vi.fn());

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    createProject: mockCreateProject,
    importAudio: mockImportAudio,
  },
}));

function createInput() {
  return {
    activeTextId: 'text-1',
    getActiveTextId: vi.fn(async () => 'text-1'),
    addMediaItem: vi.fn(),
    setSaveState: vi.fn(),
    setActiveTextId: vi.fn(),
    tf: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'transcription.importExport.conflict') {
        return 'conflict-message';
      }
      if (key === 'transcription.action.audioImportFailed') {
        return `audio-import-failed: ${String(opts?.message ?? '')}`;
      }
      if (key === 'transcription.action.audioImported') {
        return `audio-imported: ${String(opts?.filename ?? '')}`;
      }
      return key;
    },
  };
}

function installMediaMetadataMock(duration = 12.5) {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-media');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'audio' || tagName === 'video') {
      const listeners = new Map<string, EventListener>();
      const media = {
        duration,
        addEventListener: vi.fn((type: string, cb: EventListener) => {
          listeners.set(type, cb);
          if (type === 'loadedmetadata') {
            queueMicrotask(() => listeners.get('loadedmetadata')?.(new Event('loadedmetadata')));
          }
        }),
        removeEventListener: vi.fn(),
        set src(_value: string) {},
      };
      return media as unknown as HTMLElement;
    }
    return originalCreateElement(tagName);
  });
}

function createChangeEvent(file: File) {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  Object.defineProperty(input, 'value', {
    configurable: true,
    writable: true,
    value: file.name,
  });
  return {
    event: { target: input } as React.ChangeEvent<HTMLInputElement>,
    input,
  };
}

describe('useMediaImport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCreateProject.mockReset();
    mockImportAudio.mockReset();
    installMediaMetadataMock();
  });

  it('surfaces import errors via saveState and clears file input', async () => {
    const input = createInput();
    mockImportAudio.mockRejectedValueOnce(new Error('disk full'));

    const { result } = renderHook(() => useMediaImport(input));
    const file = new File(['demo'], 'demo.wav', { type: 'audio/wav' });
    const { event, input: fileInput } = createChangeEvent(file);

    await act(async () => {
      await result.current.handleDirectMediaImport(event);
    });

    expect(input.setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: 'audio-import-failed: disk full',
      errorMeta: expect.objectContaining({ category: 'action', action: '导入音频' }),
    }));
    expect(fileInput.value).toBe('');
    expect(input.addMediaItem).not.toHaveBeenCalled();
  });

  it('maps conflict-like errors to shared conflict message and clears file input', async () => {
    const input = createInput();
    const conflict = new Error('row changed externally');
    conflict.name = 'TranscriptionPersistenceConflictError';
    mockImportAudio.mockRejectedValueOnce(conflict);

    const { result } = renderHook(() => useMediaImport(input));
    const file = new File(['demo'], 'demo.wav', { type: 'audio/wav' });
    const { event, input: fileInput } = createChangeEvent(file);

    await act(async () => {
      await result.current.handleDirectMediaImport(event);
    });

    expect(input.setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: 'conflict-message',
      errorMeta: expect.objectContaining({ category: 'conflict', action: '导入音频' }),
    }));
    expect(fileInput.value).toBe('');
  });
});