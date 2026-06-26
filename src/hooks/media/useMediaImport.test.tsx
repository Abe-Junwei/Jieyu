// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readMediaFileFromInput } from './readMediaFileFromInput';

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
  return { target: input } as React.ChangeEvent<HTMLInputElement>;
}

describe('readMediaFileFromInput', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installMediaMetadataMock();
  });

  it('returns file and duration for audio', async () => {
    const file = new File(['demo'], 'demo.wav', { type: 'audio/wav' });
    const result = await readMediaFileFromInput(createChangeEvent(file));
    expect(result).toEqual({ file, duration: 12.5 });
  });

  it('returns null for non-media files', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const result = await readMediaFileFromInput(createChangeEvent(file));
    expect(result).toBeNull();
  });
});

describe('useMediaImport', () => {
  it('exposes mediaFileInputRef only', async () => {
    const { useMediaImport } = await import('./useMediaImport');
    const { result } = await import('@testing-library/react').then(({ renderHook }) =>
      renderHook(() => useMediaImport()),
    );
    expect(result.current.mediaFileInputRef).toBeDefined();
    expect(result.current).not.toHaveProperty('handleDirectMediaImport');
  });
});
