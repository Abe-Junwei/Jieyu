// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import { LocaleProvider } from '../../i18n';
import { MediaContentMismatchError } from '../../services/linguisticServiceMediaImport';
import type { TranscriptionRecordProgressRow } from '../../utils/homeTranscriptionRecordProgress';
import { WorkbenchFilePane } from './WorkbenchFilePane';

const record: TranscriptionRecordProgressRow = {
  kind: 'transcription_record',
  mediaId: 'media-empty',
  filename: 'speech.wav',
  storageFilename: 'speech.wav',
  sentenceCount: 0,
  transcriptionRate: null,
  translationRate: null,
  annotationRate: null,
  transcriptionUnitCount: 0,
  translationRowCount: 0,
  transcribedCount: 0,
  translatedCount: 0,
  annotatedCount: 0,
  hasPlayableBytes: false,
  unitCount: 0,
  anchorCount: 0,
};

function renderPane() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LocaleProvider locale="zh-CN">
          <WorkbenchFilePane
            locale="zh-CN"
            textId="text-a"
            title="项目"
            updatedLabel=""
            records={[record]}
            onChanged={vi.fn()}
          />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'Audio',
    class {
      onloadedmetadata: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = '';
      set src(_value: string) {
        this.onloadedmetadata?.();
      }
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function chooseFile() {
  fireEvent.click(await screen.findByRole('button', { name: '重新挂接音频' }));
  const input = screen.getByLabelText('导入媒体');
  const file = new File(['wav'], 'other.wav', { type: 'audio/wav' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('WorkbenchFilePane reattach', () => {
  it('asks before writing a file whose fingerprint does not match, then retries that same id', async () => {
    const importAudio = vi
      .spyOn(LinguisticService.media, 'importAudio')
      .mockRejectedValueOnce(
        new MediaContentMismatchError('media-empty', 'aa'.repeat(32), 'bb'.repeat(32)),
      )
      .mockResolvedValueOnce({ mediaId: 'media-empty' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPane();

    await chooseFile();

    await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(2));
    expect(importAudio.mock.calls[1]?.[0]).toMatchObject({
      importMode: 'replace',
      replaceMediaId: 'media-empty',
      acknowledgeContentMismatch: true,
    });
    expect(await screen.findByText('媒体「other.wav」导入成功。')).toBeTruthy();
  });

  it('leaves the recording unchanged when the fingerprint confirm is cancelled', async () => {
    const importAudio = vi
      .spyOn(LinguisticService.media, 'importAudio')
      .mockRejectedValueOnce(
        new MediaContentMismatchError('media-empty', 'aa'.repeat(32), 'bb'.repeat(32)),
      );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPane();

    await chooseFile();

    expect(await screen.findByText('已取消重新挂接：所选文件与原录音内容不一致。')).toBeTruthy();
    expect(importAudio).toHaveBeenCalledTimes(1);
  });
});

describe('WorkbenchFilePane same-name import', () => {
  const pickMedia = (file: File) =>
    fireEvent.change(screen.getByLabelText('导入媒体'), { target: { files: [file] } });

  it('shows a non-success notice when the same bytes are already imported', async () => {
    const importAudio = vi
      .spyOn(LinguisticService.media, 'importAudio')
      .mockResolvedValueOnce({
        mediaId: 'media-a',
        contentSha256: 'aa'.repeat(32),
        alreadyImported: true,
      })
      .mockResolvedValueOnce({ mediaId: 'media-b', contentSha256: 'bb'.repeat(32) });
    renderPane();

    pickMedia(new File(['bytes-X'], 'a.wav', { type: 'audio/wav' }));
    const notice = await screen.findByText('项目里已有内容完全相同的「a.wav」，这次没有重复导入。');
    expect(notice.getAttribute('role')).toBe('alert');
    expect(screen.queryByText('媒体「a.wav」导入成功。')).toBeNull();

    pickMedia(new File(['bytes-Y'], 'a.wav', { type: 'audio/wav' }));
    expect(await screen.findByText('媒体「a.wav」导入成功。')).toBeTruthy();
    expect(importAudio).toHaveBeenCalledTimes(2);
    expect(importAudio.mock.calls[0]?.[0]).not.toHaveProperty('importMode');
  });

  it('says the audio was kept when binding segments to it failed afterwards', async () => {
    vi.spyOn(LinguisticService.media, 'importAudio').mockResolvedValueOnce({
      mediaId: 'media-a',
      unitBindingFailed: true,
    });
    renderPane();

    pickMedia(new File(['bytes-X'], 'a.wav', { type: 'audio/wav' }));
    const notice = await screen.findByText(
      '媒体「a.wav」已导入，但未挂到录音上的语段没能挂接到它。请检查时间轴，勿重复导入。',
    );
    expect(notice.getAttribute('role')).toBe('alert');
  });
});
