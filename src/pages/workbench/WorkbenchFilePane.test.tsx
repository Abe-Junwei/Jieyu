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
  canRemoveEmpty: false,
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
