// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dexieStoragePort,
  installStoragePort,
  RecordingRemovalBlockedError,
  StorageReadbackError,
} from '../../db/storagePort';
import { LocaleProvider } from '../../i18n';
import type { ProjectAudioFile } from '../../utils/projectSourceFiles';
import { ProjectFileBrowser } from './ProjectFileBrowser';

function card(extra: Partial<ProjectAudioFile> = {}): ProjectAudioFile {
  return {
    id: 'media-1',
    name: 'speech.wav',
    filename: 'speech.wav',
    sentenceCount: 0,
    hasPlayableBytes: false,
    unitCount: 0,
    anchorCount: 0,
    ...extra,
  };
}

function renderBoard(audio: ProjectAudioFile[], onChanged: () => void = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LocaleProvider locale="zh-CN">
          <ProjectFileBrowser
            variant="board"
            textId="text-a"
            audio={audio}
            onChanged={onChanged}
            onRelinkAudio={vi.fn()}
          />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  installStoragePort(dexieStoragePort);
  vi.restoreAllMocks();
});

describe('ProjectFileBrowser empty recording', () => {
  it('offers removal on a card marked audio-missing, and still offers reattach', async () => {
    renderBoard([card()]);
    expect(await screen.findByText(/音频缺失/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新挂接音频' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '移除这条录音' })).toBeTruthy();
  });

  it('says the entry is gone when refresh fails after the delete has committed', async () => {
    installStoragePort({
      ...dexieStoragePort,
      removeEmptyRecording: vi.fn(async () => ({ unboundSourceIds: [] })),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChanged = vi.fn(() => {
      throw new Error('refresh failed');
    });
    renderBoard([card()], onChanged);

    fireEvent.click(await screen.findByRole('button', { name: '移除这条录音' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('这条录音已经移除，看板尚未刷新。');
    expect(onChanged).toHaveBeenCalled();
  });

  it('keeps the blocked message when the store refuses, and does not claim the board is stale', async () => {
    const removeEmptyRecording = vi.fn(async () => {
      throw new RecordingRemovalBlockedError('media-1', 'has-bytes');
    });
    installStoragePort({ ...dexieStoragePort, removeEmptyRecording });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChanged = vi.fn();
    renderBoard([card()], onChanged);

    fireEvent.click(await screen.findByRole('button', { name: '移除这条录音' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '这条录音还有音频、句段或锚点，不能移除条目。',
    );
    expect(removeEmptyRecording).toHaveBeenCalledWith('media-1');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('shows a localized message when the removal cannot be read back', async () => {
    installStoragePort({
      ...dexieStoragePort,
      removeEmptyRecording: vi.fn(async () => {
        throw new StorageReadbackError('removeEmptyRecording');
      }),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderBoard([card()]);

    fireEvent.click(await screen.findByRole('button', { name: '移除这条录音' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('移除后没能确认结果，请刷新看板查看这条录音是否还在。');
    expect(alert).not.toHaveTextContent('read-back');
  });
});
