// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  writeCorpusWorksetClipboard,
  writeCorpusWorksetHtmlClipboard,
} from './corpusWorksetClipboard';
import { CORPUS_EXPORT_MAX_CHARS } from './corpusWorksetExport';

class FakeClipboardItem {
  readonly types: string[];
  constructor(readonly items: Record<string, Blob>) {
    this.types = Object.keys(items);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('corpusWorksetClipboard', () => {
  it('does not write an empty payload', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(writeCorpusWorksetClipboard('')).resolves.toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not write a payload over the export cap', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const text = 'x'.repeat(CORPUS_EXPORT_MAX_CHARS + 1);
    await expect(writeCorpusWorksetClipboard(text)).resolves.toEqual({
      ok: false,
      reason: 'too-long',
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('writes html and plain blobs through ClipboardItem', async () => {
    const write = vi.fn<(items: FakeClipboardItem[]) => Promise<void>>(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    await expect(
      writeCorpusWorksetHtmlClipboard({
        html: '<p>hello</p>',
        plain: 'hello',
      }),
    ).resolves.toEqual({ ok: true });
    expect(writeText).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    const written = write.mock.calls[0]?.[0];
    const item = written?.[0];
    expect(item).toBeInstanceOf(FakeClipboardItem);
    if (!(item instanceof FakeClipboardItem)) return;
    expect(item.items['text/html']).toBeInstanceOf(Blob);
    expect(item.items['text/plain']).toBeInstanceOf(Blob);
    expect(item.items['text/html']?.type).toBe('text/html');
    expect(item.items['text/plain']?.type).toBe('text/plain');
    await expect(item.items['text/html']?.text()).resolves.toBe('<p>hello</p>');
    await expect(item.items['text/plain']?.text()).resolves.toBe('hello');
  });

  it('falls back to writeText when ClipboardItem is missing', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(
      writeCorpusWorksetHtmlClipboard({
        html: '<p>hello</p>',
        plain: 'hello',
      }),
    ).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
